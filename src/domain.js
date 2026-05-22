export const CHECKIN_STATUS = Object.freeze({
  COMPLETED: 'completed',
  LEAVE: 'leave',
  RESCHEDULED: 'rescheduled',
  MAKEUP_COMPLETED: 'makeup_completed',
  CANCELLED: 'cancelled',
});

export const STATUS_LABELS = Object.freeze({
  [CHECKIN_STATUS.COMPLETED]: '已上课',
  [CHECKIN_STATUS.LEAVE]: '请假',
  [CHECKIN_STATUS.RESCHEDULED]: '调课',
  [CHECKIN_STATUS.MAKEUP_COMPLETED]: '已补课',
  [CHECKIN_STATUS.CANCELLED]: '取消',
});

export const RECORD_TYPE = Object.freeze({
  SCHEDULED: 'scheduled',
  TEMPORARY: 'temporary',
  MAKEUP: 'makeup',
});

export const TYPE_LABELS = Object.freeze({
  [RECORD_TYPE.SCHEDULED]: '固定课',
  [RECORD_TYPE.TEMPORARY]: '临时课',
  [RECORD_TYPE.MAKEUP]: '补课',
});

export function createId(prefix = 'id') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeSchedules(input) {
  if (Array.isArray(input.schedules) && input.schedules.length > 0) {
    return input.schedules
      .map((schedule) => ({ weekday: Number(schedule?.weekday), time: schedule?.time || input.time || '' }))
      .filter((schedule) => Number.isInteger(schedule.weekday) && schedule.weekday >= 0 && schedule.weekday <= 6);
  }
  if (Array.isArray(input.weekdays)) {
    return input.weekdays
      .map((weekday) => ({ weekday: Number(weekday), time: input.time || '' }))
      .filter((schedule) => Number.isInteger(schedule.weekday) && schedule.weekday >= 0 && schedule.weekday <= 6);
  }
  return [];
}

function uniqueWeekdays(schedules) {
  return [...new Set(schedules.map((schedule) => schedule.weekday))];
}

export function createCourse(input) {
  const now = input.now || new Date().toISOString();
  const schedules = normalizeSchedules(input);
  return {
    id: input.id || createId('course'),
    name: String(input.name || '').trim(),
    schedules,
    weekdays: uniqueWeekdays(schedules),
    time: input.time || schedules[0]?.time || '',
    totalLessons: Number(input.totalLessons || 0),
    remainingLessons: Number(input.remainingLessons ?? input.totalLessons ?? 0),
    defaultLessonCost: Number(input.defaultLessonCost ?? 1),
    isActive: input.isActive ?? true,
    note: input.note || '',
    deletedAt: input.deletedAt || '',
    createdAt: input.createdAt || now,
    updatedAt: now,
  };
}

export function consumesLesson(status) {
  return status === CHECKIN_STATUS.COMPLETED || status === CHECKIN_STATUS.MAKEUP_COMPLETED;
}

export function createRecord(input) {
  const now = input.now || new Date().toISOString();
  const course = input.course || {};
  return {
    id: input.id || createId('record'),
    courseId: input.courseId || course.id || '',
    courseNameSnapshot: input.courseNameSnapshot || course.name || input.courseName || '',
    date: input.date,
    time: input.time ?? course.time ?? '',
    type: input.type || RECORD_TYPE.SCHEDULED,
    status: input.status || CHECKIN_STATUS.COMPLETED,
    lessonCost: Number(input.lessonCost ?? course.defaultLessonCost ?? 1),
    homework: input.homework || '',
    feedback: input.feedback || '',
    note: input.note || '',
    makeupForRecordId: input.makeupForRecordId || '',
    deletedAt: input.deletedAt || '',
    createdAt: input.createdAt || now,
    updatedAt: now,
  };
}

function getRecordLessonCost(record) {
  const safeRecord = record || {};
  return consumesLesson(safeRecord.status) ? Number(safeRecord.lessonCost || 0) : 0;
}

export function applyLessonBalance(course, lessonDelta, updatedAt = new Date().toISOString()) {
  return {
    ...course,
    remainingLessons: Math.max(0, Number(course.remainingLessons || 0) + Number(lessonDelta || 0)),
    updatedAt,
  };
}

export function applyRecordLessonCost(course, record) {
  return applyLessonBalance(course, -getRecordLessonCost(record), record.updatedAt);
}

export function rollbackRecordLessonCost(course, record) {
  return applyLessonBalance(course, getRecordLessonCost(record), record.updatedAt);
}

export function getRecordLessonDelta(oldRecord, nextRecord) {
  return getRecordLessonCost(oldRecord) - getRecordLessonCost(nextRecord);
}
