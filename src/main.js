import { CHECKIN_STATUS, RECORD_TYPE, applyRecordLessonCost, createCourse, createRecord } from './domain.js';
import { createBackup, parseBackup, recordsToCsv } from './backup.js';
import { createEmptyState, loadState, saveState } from './storage.js';
import { renderApp, PAGES } from './ui.js';

const app = document.querySelector('#app');
let state = loadInitialState();
let page = PAGES.TODAY;
let recordFilters = {};

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

function render() {
  app.innerHTML = renderApp({ state, page, today: formatLocalDate(), recordFilters });
}

app.addEventListener('click', (event) => {
  const actionButton = event.target.closest('[data-action]');
  if (actionButton?.dataset.action === 'export-json') {
    const backup = createBackup(state);
    downloadText(`兴趣班打卡备份-${formatLocalDate()}.json`, JSON.stringify(backup, null, 2), 'application/json;charset=utf-8');
    return;
  }

  if (actionButton?.dataset.action === 'export-csv') {
    downloadText(`兴趣班打卡记录-${formatLocalDate()}.csv`, recordsToCsv(state.records), 'text/csv;charset=utf-8');
    return;
  }

  const pageButton = event.target.closest('[data-page]');
  if (pageButton) {
    page = pageButton.dataset.page;
    render();
  }
});

app.addEventListener('submit', (event) => {
  const courseForm = event.target.closest('[data-form="course"]');
  if (courseForm) {
    event.preventDefault();
    const data = new FormData(courseForm);
    const course = createCourse({
      name: data.get('name'),
      weekdays: [Number(data.get('weekday'))],
      time: data.get('time'),
      totalLessons: data.get('totalLessons'),
      remainingLessons: data.get('remainingLessons'),
      defaultLessonCost: data.get('defaultLessonCost'),
      note: data.get('note'),
    });
    persist({ ...state, courses: [...state.courses, course] });
    render();
    return;
  }

  const recordForm = event.target.closest('[data-form="record"]');
  if (recordForm) {
    event.preventDefault();
    const data = new FormData(recordForm);
    const selectedCourse = state.courses.find((item) => item.id === data.get('courseId'));
    const makeupForRecordId = data.get('makeupForRecordId') || '';
    const makeupRecord = makeupForRecordId ? state.records.find((item) => item.id === makeupForRecordId) : null;
    const course = makeupRecord ? state.courses.find((item) => item.id === makeupRecord.courseId) || selectedCourse : selectedCourse;
    if (!course) return;
    const record = createRecord({
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
    });
    const updatedCourses = state.courses.map((item) => (
      item.id === course.id ? applyRecordLessonCost(item, record) : item
    ));
    persist({ courses: updatedCourses, records: [...state.records, record] });
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
  }
});

app.addEventListener('change', async (event) => {
  const input = event.target.closest('[data-action="import-json"]');
  if (!input || !input.files?.[0]) return;
  try {
    const text = await input.files[0].text();
    const imported = parseBackup(text);
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
