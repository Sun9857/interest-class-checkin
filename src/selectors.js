import { CHECKIN_STATUS, consumesLesson } from './domain.js';

export function getWeekday(dateString) {
  return new Date(`${dateString}T00:00:00`).getDay();
}

export function getCoursesForDate(courses, dateString) {
  const weekday = getWeekday(dateString);
  return courses
    .filter((course) => course.isActive && course.weekdays.includes(weekday))
    .sort((a, b) => String(a.time).localeCompare(String(b.time)));
}

export function filterRecords(records, filters = {}) {
  return records
    .filter((record) => !filters.courseId || record.courseId === filters.courseId)
    .filter((record) => !filters.status || record.status === filters.status)
    .filter((record) => !filters.from || record.date >= filters.from)
    .filter((record) => !filters.to || record.date <= filters.to)
    .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
}

function monthPrefix(dateString) {
  return dateString.slice(0, 7);
}

export function summarizeCourseStats(courses, records, todayString) {
  const currentMonth = monthPrefix(todayString);
  return courses.map((course) => {
    const courseRecords = records.filter((record) => record.courseId === course.id);
    const monthRecords = courseRecords.filter((record) => monthPrefix(record.date) === currentMonth);
    const consumedThisMonth = monthRecords
      .filter((record) => consumesLesson(record.status))
      .reduce((sum, record) => sum + Number(record.lessonCost || 0), 0);
    const leaveOrRescheduled = courseRecords.filter(
      (record) => record.status === CHECKIN_STATUS.LEAVE || record.status === CHECKIN_STATUS.RESCHEDULED,
    );
    const madeUpIds = new Set(
      courseRecords
        .filter((record) => record.status === CHECKIN_STATUS.MAKEUP_COMPLETED && record.makeupForRecordId)
        .map((record) => record.makeupForRecordId),
    );
    const classDates = courseRecords
      .filter((record) => consumesLesson(record.status))
      .map((record) => record.date)
      .sort();

    return {
      courseId: course.id,
      courseName: course.name,
      remainingLessons: Number(course.remainingLessons || 0),
      monthLessonCost: consumedThisMonth,
      pendingMakeups: leaveOrRescheduled.filter((record) => !madeUpIds.has(record.id)).length,
      completedMakeups: courseRecords.filter((record) => record.status === CHECKIN_STATUS.MAKEUP_COMPLETED).length,
      lastClassDate: classDates.at(-1) || '',
    };
  });
}
