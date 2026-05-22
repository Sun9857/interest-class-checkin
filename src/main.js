import {
  CHECKIN_STATUS,
  RECORD_TYPE,
  applyLessonBalance,
  applyRecordLessonCost,
  createCourse,
  createRecord,
  getRecordLessonDelta,
  rollbackRecordLessonCost,
} from './domain.js';
import { createBackup, parseBackup, recordsToCsv } from './backup.js';
import { createEmptyState, loadState, saveState } from './storage.js';
import { renderApp, PAGES } from './ui.js';

const app = document.querySelector('#app');
let state = loadInitialState();
let page = PAGES.TODAY;
let recordFilters = {};
let courseDraftSchedules = [{ weekday: 1, time: '' }];
let editingCourseId = '';
let editingRecordId = '';

function downloadText(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function loadInitialState() {
  try {
    return loadState();
  } catch {
    return createEmptyState();
  }
}

function persist(nextState) {
  try {
    saveState(localStorage, nextState);
    state = nextState;
    return true;
  } catch {
    alert('浏览器存储不可用，本次修改未保存');
    return false;
  }
}

export function formatLocalDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function extractCourseDraftFromForm(form) {
  if (!form) return courseDraftSchedules;
  const data = new FormData(form);
  const weekdays = data.getAll('scheduleWeekday');
  const times = data.getAll('scheduleTime');
  const schedules = weekdays.map((weekday, index) => ({
    weekday: Number(weekday),
    time: times[index] || '',
  }));
  return schedules.length > 0 ? schedules : [{ weekday: 1, time: '' }];
}

function getActiveCourseById(courseId) {
  return state.courses.find((course) => course.id === courseId && !course.deletedAt) || null;
}

function getEditingCourse() {
  return state.courses.find((course) => course.id === editingCourseId) || null;
}

function getEditingRecord() {
  return state.records.find((record) => record.id === editingRecordId) || null;
}

function canEditRecord(record) {
  if (!record || record.deletedAt) return false;
  return state.courses.some((course) => course.id === record.courseId && !course.deletedAt);
}

function resetCourseFormState() {
  editingCourseId = '';
  courseDraftSchedules = [{ weekday: 1, time: '' }];
}

function resetRecordFormState() {
  editingRecordId = '';
}

function toCourseFormSchedules(course) {
  const base = Array.isArray(course?.schedules) && course.schedules.length > 0
    ? course.schedules
    : (Array.isArray(course?.weekdays) ? course.weekdays.map((weekday) => ({ weekday: Number(weekday), time: course.time || '' })) : []);
  return base.length > 0 ? base : [{ weekday: 1, time: '' }];
}

function applyCourseLessonBalanceSafely(course, record, nowIso) {
  if (!course) return course;
  const delta = getRecordLessonDelta(null, record);
  if (course.deletedAt && delta < 0) return course;
  return applyLessonBalance(course, delta, nowIso);
}

function render() {
  app.innerHTML = renderApp({ state, page, today: formatLocalDate(), recordFilters, courseDraftSchedules, editingCourseId, editingRecordId });
}

app.addEventListener('click', (event) => {
  const actionButton = event.target.closest('[data-action]');
  const courseForm = actionButton?.closest('[data-form="course"]');
  const action = actionButton?.dataset.action;

  if (action === 'add-course-schedule') {
    const currentDraft = extractCourseDraftFromForm(courseForm);
    courseDraftSchedules = [...currentDraft, { weekday: 1, time: '' }];
    render();
    return;
  }

  if (action === 'remove-course-schedule') {
    const index = Number(actionButton.dataset.index);
    const currentDraft = extractCourseDraftFromForm(courseForm);
    if (Number.isInteger(index) && currentDraft.length > 1) {
      courseDraftSchedules = currentDraft.filter((_item, position) => position !== index);
      if (courseDraftSchedules.length === 0) {
        courseDraftSchedules = [{ weekday: 1, time: '' }];
      }
      render();
    }
    return;
  }

  if (action === 'cancel-edit-course') {
    resetCourseFormState();
    render();
    return;
  }

  if (action === 'edit-course') {
    const course = getActiveCourseById(actionButton.dataset.courseId);
    if (!course) {
      return;
    }

    editingCourseId = course.id;
    courseDraftSchedules = toCourseFormSchedules(course);
    render();
    return;
  }

  if (action === 'edit-record') {
    const record = state.records.find((item) => item.id === actionButton.dataset.recordId);
    if (!canEditRecord(record)) {
      return;
    }

    editingRecordId = record.id;
    render();
    return;
  }

  if (action === 'cancel-edit-record') {
    resetRecordFormState();
    render();
    return;
  }

  if (action === 'toggle-course-active') {
    const courseId = actionButton.dataset.courseId;
    const now = new Date().toISOString();
    const nextCourses = state.courses.map((course) => (
      course.id === courseId ? { ...course, isActive: !course.isActive, updatedAt: now } : course
    ));
    persist({ ...state, courses: nextCourses });
    render();
    return;
  }

  if (action === 'delete-record') {
    const recordId = actionButton.dataset.recordId;
    const now = new Date().toISOString();
    const record = state.records.find((item) => item.id === recordId);
    if (!record || record.deletedAt) {
      return;
    }

    const nextCourses = state.courses.map((course) => (
      course.id === record.courseId ? rollbackRecordLessonCost(course, record) : course
    ));
    const nextRecords = state.records.map((item) => (
      item.id === recordId ? { ...item, deletedAt: now, updatedAt: now } : item
    ));

    const saved = persist({ ...state, courses: nextCourses, records: nextRecords });
    if (saved && editingRecordId === recordId) {
      resetRecordFormState();
    }
    render();
    return;
  }

  if (action === 'restore-record') {
    const recordId = actionButton.dataset.recordId;
    const now = new Date().toISOString();
    const record = state.records.find((item) => item.id === recordId);
    if (!record || !record.deletedAt) {
      return;
    }

    const targetCourse = state.courses.find((course) => course.id === record.courseId);
    if (!targetCourse || targetCourse.deletedAt) {
      return;
    }

    const nextCourses = state.courses.map((course) => {
      if (course.id !== record.courseId) return course;
      return applyRecordLessonCost(course, record);
    });

    const nextRecords = state.records.map((item) => (
      item.id === recordId ? { ...item, deletedAt: '', updatedAt: now } : item
    ));

    const saved = persist({ ...state, courses: nextCourses, records: nextRecords });
    if (saved && editingRecordId === recordId) {
      resetRecordFormState();
    }
    render();
    return;
  }

  if (action === 'delete-course') {
    const courseId = actionButton.dataset.courseId;
    const now = new Date().toISOString();
    const nextCourses = state.courses.map((course) => (
      course.id === courseId && !course.deletedAt ? { ...course, deletedAt: now, updatedAt: now } : course
    ));
    const saved = persist({ ...state, courses: nextCourses });
    if (saved && editingCourseId === courseId) {
      resetCourseFormState();
    }
    render();
    return;
  }

  if (action === 'restore-course') {
    const courseId = actionButton.dataset.courseId;
    const nextCourses = state.courses.map((course) => (
      course.id === courseId ? { ...course, deletedAt: '', updatedAt: new Date().toISOString() } : course
    ));
    persist({ ...state, courses: nextCourses });
    render();
    return;
  }

  if (action === 'export-json') {
    const backup = createBackup(state);
    downloadText(`兴趣班打卡备份-${formatLocalDate()}.json`, JSON.stringify(backup, null, 2), 'application/json;charset=utf-8');
    return;
  }

  if (action === 'export-csv') {
    downloadText(`兴趣班打卡记录-${formatLocalDate()}.csv`, recordsToCsv(state.records), 'text/csv;charset=utf-8');
    return;
  }

  const pageButton = event.target.closest('[data-page]');
  if (pageButton) {
    page = pageButton.dataset.page;
    if (page !== PAGES.COURSES) {
      resetCourseFormState();
    }
    if (page !== PAGES.RECORDS) {
      resetRecordFormState();
    }
    render();
  }
});

app.addEventListener('submit', (event) => {
  const courseForm = event.target.closest('[data-form="course"]');
  if (courseForm) {
    event.preventDefault();
    const data = new FormData(courseForm);
    const weekdays = data.getAll('scheduleWeekday');
    const times = data.getAll('scheduleTime');
    const schedules = weekdays.map((weekday, index) => ({
      weekday: Number(weekday),
      time: times[index] || '',
    }));
    const nowIso = new Date().toISOString();
    const editingCourse = getEditingCourse();

    if (editingCourseId && editingCourse) {
      const updated = createCourse({
        ...editingCourse,
        name: data.get('name'),
        schedules,
        totalLessons: data.get('totalLessons'),
        remainingLessons: data.get('remainingLessons'),
        defaultLessonCost: data.get('defaultLessonCost'),
        note: data.get('note'),
        id: editingCourse.id,
        createdAt: editingCourse.createdAt,
        now: nowIso,
      });
      const saved = persist({ ...state, courses: state.courses.map((course) => (
        course.id === editingCourse.id ? updated : course
      )) });
      if (saved) {
        resetCourseFormState();
      }
      render();
      return;
    }

    const course = createCourse({
      name: data.get('name'),
      schedules,
      totalLessons: data.get('totalLessons'),
      remainingLessons: data.get('remainingLessons'),
      defaultLessonCost: data.get('defaultLessonCost'),
      note: data.get('note'),
      now: nowIso,
    });
    const saved = persist({ ...state, courses: [...state.courses, course] });
    if (saved) {
      courseDraftSchedules = [{ weekday: 1, time: '' }];
    }
    render();
    return;
  }

  const recordForm = event.target.closest('[data-form="record"]');
  if (recordForm) {
    event.preventDefault();
    const data = new FormData(recordForm);
    const nowIso = new Date().toISOString();
    const availableCourses = state.courses.filter((item) => !item.deletedAt);
    const selectedCourse = availableCourses.find((item) => item.id === data.get('courseId'));
    const makeupForRecordId = data.get('makeupForRecordId') || '';
    const makeupRecord = makeupForRecordId ? state.records.find((item) => item.id === makeupForRecordId) : null;
    const course = makeupForRecordId
      ? (makeupRecord ? availableCourses.find((item) => item.id === makeupRecord.courseId) : null)
      : selectedCourse;
    if (!course) return;

    const buildRecord = (overrides = {}) => createRecord({
      course,
      date: data.get('date'),
      time: data.get('time') || course.time,
      type: makeupForRecordId ? RECORD_TYPE.MAKEUP : data.get('type'),
      status: makeupForRecordId ? CHECKIN_STATUS.MAKEUP_COMPLETED : data.get('status'),
      lessonCost: data.get('lessonCost'),
      makeupForRecordId,
      homework: data.get('homework'),
      feedback: data.get('feedback'),
      note: data.get('note'),
      now: nowIso,
      ...overrides,
    });

    if (editingRecordId && getEditingRecord()) {
      const originalRecord = getEditingRecord();
      if (!canEditRecord(originalRecord)) {
        resetRecordFormState();
        render();
        return;
      }

      const nextRecord = buildRecord({
        id: originalRecord.id,
        createdAt: originalRecord.createdAt,
        deletedAt: originalRecord.deletedAt || '',
      });

      const updateCourses = () => {
        if (originalRecord.courseId === nextRecord.courseId) {
          const courseId = nextRecord.courseId;
          const delta = getRecordLessonDelta(originalRecord, nextRecord);
          if (delta === 0) {
            return state.courses;
          }
          return state.courses.map((item) => {
            if (item.id !== courseId) return item;
            if (item.deletedAt && delta < 0) return item;
            return applyLessonBalance(item, delta, nowIso);
          });
        }

        const oldCourse = state.courses.find((item) => item.id === originalRecord.courseId);
        const newCourse = state.courses.find((item) => item.id === nextRecord.courseId);
        return state.courses.map((item) => {
          if (item.id === originalRecord.courseId && oldCourse) {
            return rollbackRecordLessonCost(item, originalRecord);
          }

          if (item.id === nextRecord.courseId && newCourse && !newCourse.deletedAt) {
            return applyRecordLessonCost(item, nextRecord);
          }

          return item;
        });
      };

      const nextRecords = state.records.map((record) => (record.id === originalRecord.id ? nextRecord : record));
      const saved = persist({ ...state, courses: updateCourses(), records: nextRecords });
      if (saved) {
        resetRecordFormState();
      }
      render();
      return;
    }

    const newRecord = buildRecord();
    const updatedCourses = state.courses.map((item) => (
      item.id === course.id ? applyCourseLessonBalanceSafely(item, newRecord, nowIso) : item
    ));
    persist({ courses: updatedCourses, records: [...state.records, newRecord] });
    render();
    return;
  }

  const filterForm = event.target.closest('[data-form="record-filter"]');
  if (filterForm) {
    event.preventDefault();
    const data = new FormData(filterForm);
    recordFilters = {
      courseId: data.get('courseId') || '',
      status: data.get('status') || '',
      from: data.get('from') || '',
      to: data.get('to') || '',
    };
    render();
    return;
  }

  const settingsForm = event.target.closest('[data-form="settings"]');
  if (settingsForm) {
    event.preventDefault();
    const data = new FormData(settingsForm);
    const rawThreshold = data.get('lowLessonThreshold');
    const parsedThreshold = rawThreshold === '' || rawThreshold === null ? Number.NaN : Number(rawThreshold);
    const fallback = Number(state.settings?.lowLessonThreshold);
    const lowLessonThreshold = Number.isFinite(parsedThreshold) && parsedThreshold >= 0
      ? parsedThreshold
      : (Number.isFinite(fallback) && fallback >= 0 ? fallback : 3);
    persist({ ...state, settings: { ...(state.settings || {}), lowLessonThreshold } });
    render();
    return;
  }
});

app.addEventListener('change', async (event) => {
  const input = event.target.closest('[data-action="import-json"]');
  if (!input || !input.files?.[0]) return;
  try {
    const text = await input.files[0].text();
    const imported = parseBackup(text);
    const backup = createBackup(state);
    downloadText(`兴趣班打卡导入前备份-${formatLocalDate()}.json`, JSON.stringify(backup, null, 2), 'application/json;charset=utf-8');
    const saved = persist(imported);
    if (saved) {
      page = PAGES.TODAY;
      render();
      alert('备份导入成功');
    }
  } catch (error) {
    alert(error instanceof Error ? error.message : '备份导入失败');
  }
});

render();
