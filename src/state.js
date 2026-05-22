const DEFAULT_LOW_LESSON_THRESHOLD = 3;

function normalizeSchedules(course) {
  if (Array.isArray(course?.schedules) && course.schedules.length > 0) {
    return course.schedules
      .map((schedule) => ({ weekday: Number(schedule?.weekday), time: schedule?.time || course.time || '' }))
      .filter((schedule) => Number.isInteger(schedule.weekday) && schedule.weekday >= 0 && schedule.weekday <= 6);
  }

  if (Array.isArray(course?.weekdays) && course.weekdays.length > 0) {
    return course.weekdays
      .map((weekday) => ({ weekday: Number(weekday), time: course.time || '' }))
      .filter((schedule) => Number.isInteger(schedule.weekday) && schedule.weekday >= 0 && schedule.weekday <= 6);
  }

  return [];
}

export function createEmptyState() {
  return { courses: [], records: [], settings: { lowLessonThreshold: DEFAULT_LOW_LESSON_THRESHOLD } };
}

export function normalizeCourse(course = {}) {
  const source = course && typeof course === 'object' ? course : {};
  const schedules = normalizeSchedules(source);

  return {
    ...source,
    schedules,
    weekdays: schedules.length > 0 ? schedules.map((schedule) => schedule.weekday) : Array.isArray(source.weekdays) ? source.weekdays.map(Number) : [],
    time: source.time || schedules[0]?.time || '',
    isActive: source.isActive ?? true,
    deletedAt: source.deletedAt || '',
  };
}

export function normalizeRecord(record = {}) {
  const source = record && typeof record === 'object' ? record : {};
  return { ...source, deletedAt: source.deletedAt || '' };
}

export function normalizeState(state) {
  if (!state || typeof state !== 'object') return createEmptyState();

  const lowLessonThreshold = Number(state.settings?.lowLessonThreshold ?? DEFAULT_LOW_LESSON_THRESHOLD);

  return {
    courses: Array.isArray(state.courses) ? state.courses.map(normalizeCourse) : [],
    records: Array.isArray(state.records) ? state.records.map(normalizeRecord) : [],
    settings: {
      ...(state.settings && typeof state.settings === 'object' ? state.settings : {}),
      lowLessonThreshold: Number.isFinite(lowLessonThreshold) && lowLessonThreshold >= 0 ? lowLessonThreshold : DEFAULT_LOW_LESSON_THRESHOLD,
    },
  };
}
