import { CHECKIN_STATUS, RECORD_TYPE, STATUS_LABELS } from './domain.js';
import { getCoursesForDate, filterRecords, summarizeCourseStats } from './selectors.js';

export const PAGES = Object.freeze({
  TODAY: 'today',
  COURSES: 'courses',
  RECORDS: 'records',
  STATS: 'stats',
  SETTINGS: 'settings',
});

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function navItem(page, current, label) {
  return `<button class="nav-button ${page === current ? 'active' : ''}" data-page="${escapeHtml(page)}">${label}</button>`;
}

const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function scheduleSummary(course) {
  const schedules = Array.isArray(course.schedules) && course.schedules.length > 0
    ? course.schedules
    : (course.weekdays || []).map((weekday) => ({ weekday: Number(weekday), time: course.time || '' }));
  return schedules
    .map((schedule) => `${WEEKDAY_LABELS[Number(schedule.weekday)] || '周?'} ${schedule.time || course.time || ''}`.trim())
    .join('、') || course.time || '';
}

function lowLessonThreshold(state) {
  const threshold = Number(state.settings?.lowLessonThreshold);
  return Number.isFinite(threshold) && threshold >= 0 ? threshold : 3;
}

function lowLessonWarning(course, threshold) {
  return !course.deletedAt && Number(course.remainingLessons || 0) <= threshold
    ? '<p class="low-lesson-alert">课时不足</p>'
    : '';
}

function renderRecordForm(courses, records, today, editingRecord = null) {
  const activeCourses = courses.filter((course) => !course.deletedAt);
  const availableCourses = activeCourses.length > 0 ? activeCourses : [];
  const availableCourseIds = new Set(availableCourses.map((course) => course.id));
  const editingRecordId = editingRecord?.id || '';
  const editingCourseId = editingRecord?.courseId || '';

  const existingLinkedLeaveIds = new Set(
    records
      .filter((record) => !record.deletedAt && record.status === CHECKIN_STATUS.MAKEUP_COMPLETED && record.makeupForRecordId)
      .map((record) => record.makeupForRecordId),
  );
  const madeUpIds = new Set(existingLinkedLeaveIds);
  if (editingRecord?.makeupForRecordId) {
    madeUpIds.delete(editingRecord.makeupForRecordId);
  }

  const makeupOptions = records
    .filter((record) => !record.deletedAt
      && record.id !== editingRecordId
      && (record.status === CHECKIN_STATUS.LEAVE || record.status === CHECKIN_STATUS.RESCHEDULED)
      && !madeUpIds.has(record.id)
      && availableCourseIds.has(record.courseId))
    .map((record) => `<option value="${escapeHtml(record.id)}" ${record.id === (editingRecord?.makeupForRecordId || '') ? 'selected' : ''}>${escapeHtml(record.date)} · ${escapeHtml(record.courseNameSnapshot)} · ${escapeHtml(STATUS_LABELS[record.status] || record.status)}</option>`)
    .join('');

  const makeupField = makeupOptions
    ? `<label class="full">关联请假/调课记录<select name="makeupForRecordId"><option value="">${editingRecord?.makeupForRecordId ? '不关联（当前记录未关联）' : '不关联'}</option>${makeupOptions}</select></label>`
    : '';

  const lessonCostValue = Number.isFinite(Number(editingRecord?.lessonCost)) ? editingRecord.lessonCost : 1;

  return `<form class="form-grid" data-form="record">
    <label>课程
      <select name="courseId" required>
        ${availableCourses
          .map((course) => `<option value="${escapeHtml(course.id)}" ${course.id === editingCourseId ? 'selected' : ''}>${escapeHtml(course.name)}</option>`)
          .join('')}
      </select>
    </label>
    <label>日期<input name="date" type="date" value="${escapeHtml(editingRecord?.date || today)}" required /></label>
    <label>时间<input name="time" type="time" value="${escapeHtml(editingRecord?.time || '')}" /></label>
    <label>类型
      <select name="type">
        <option value="${RECORD_TYPE.SCHEDULED}" ${editingRecord?.type === RECORD_TYPE.SCHEDULED || !editingRecord ? 'selected' : ''}>固定课</option>
        <option value="${RECORD_TYPE.TEMPORARY}" ${editingRecord?.type === RECORD_TYPE.TEMPORARY ? 'selected' : ''}>临时课</option>
        <option value="${RECORD_TYPE.MAKEUP}" ${editingRecord?.type === RECORD_TYPE.MAKEUP ? 'selected' : ''}>补课</option>
      </select>
    </label>
    <label>状态
      <select name="status">
        <option value="${CHECKIN_STATUS.COMPLETED}" ${!editingRecord || editingRecord.status === CHECKIN_STATUS.COMPLETED ? 'selected' : ''}>已上课</option>
        <option value="${CHECKIN_STATUS.LEAVE}" ${editingRecord?.status === CHECKIN_STATUS.LEAVE ? 'selected' : ''}>请假</option>
        <option value="${CHECKIN_STATUS.RESCHEDULED}" ${editingRecord?.status === CHECKIN_STATUS.RESCHEDULED ? 'selected' : ''}>调课</option>
        <option value="${CHECKIN_STATUS.MAKEUP_COMPLETED}" ${editingRecord?.status === CHECKIN_STATUS.MAKEUP_COMPLETED ? 'selected' : ''}>已补课</option>
        <option value="${CHECKIN_STATUS.CANCELLED}" ${editingRecord?.status === CHECKIN_STATUS.CANCELLED ? 'selected' : ''}>取消</option>
      </select>
    </label>
    <label>消耗课时<input name="lessonCost" type="number" min="0" step="0.5" value="${escapeHtml(lessonCostValue)}" /></label>
    ${makeupField}
    <label class="full">作业内容<textarea name="homework" rows="2">${escapeHtml(editingRecord?.homework || '')}</textarea></label>
    <label class="full">老师反馈<textarea name="feedback" rows="2">${escapeHtml(editingRecord?.feedback || '')}</textarea></label>
    <label class="full">备注<textarea name="note" rows="2">${escapeHtml(editingRecord?.note || '')}</textarea></label>
    <button class="primary" type="submit">${editingRecord ? '保存记录' : '保存打卡记录'}</button>
    ${editingRecord ? '<button class="secondary" type="button" data-action="cancel-edit-record">取消编辑</button>' : ''}
  </form>`;
}

function renderTodayPage(state, today) {
  const availableCourses = state.courses.filter((course) => !course.deletedAt);
  const scheduledCourses = getCoursesForDate(state.courses, today);
  const threshold = lowLessonThreshold(state);
  if (availableCourses.length === 0) {
    return `<section class="card"><h2>今日打卡</h2><p class="muted">今天没有固定课程。</p><p class="muted">请先在课程管理中新增课程，再添加记录。</p></section>`;
  }

  const scheduledList = scheduledCourses.length
    ? `<div class="course-list">${scheduledCourses
      .map(
        (course) => `
    <article class="course-item">
      <div><strong>${escapeHtml(course.name)}</strong><p>${escapeHtml(course.time)} · 剩余 ${escapeHtml(course.remainingLessons)} 课时</p>${lowLessonWarning(course, threshold)}</div>
    </article>`,
      )
      .join('')}</div>`
    : '<p class="muted">今天没有固定课程，可以在下方添加临时课或补课记录。</p>';

  return `<section class="card"><h2>今日打卡</h2>${scheduledList}<h3>添加临时/补课</h3>${renderRecordForm(availableCourses, state.records, today)}</section>`;
}

function renderCoursesPage(state, courseDraftSchedules = [], editingCourseId = '') {
  const activeCourses = Array.isArray(state.courses) ? state.courses.filter((course) => !course.deletedAt) : [];
  const deletedCourses = Array.isArray(state.courses) ? state.courses.filter((course) => course.deletedAt) : [];
  const editingCourse = activeCourses.find((course) => course.id === editingCourseId) || null;

  const formName = escapeHtml(editingCourse?.name || '');
  const formTotalLessons = Number.isFinite(editingCourse?.totalLessons) ? editingCourse.totalLessons : 0;
  const formRemainingLessons = Number.isFinite(editingCourse?.remainingLessons) ? editingCourse.remainingLessons : formTotalLessons;
  const formDefaultLessonCost = Number.isFinite(editingCourse?.defaultLessonCost) ? editingCourse.defaultLessonCost : 1;
  const formNote = escapeHtml(editingCourse?.note || '');
  const threshold = lowLessonThreshold(state);

  const normalCourses = activeCourses
    .map(
      (course) => `
    <article class="course-item">
      <div><strong>${escapeHtml(course.name)}</strong><p>${escapeHtml(scheduleSummary(course))} · 剩余 ${escapeHtml(course.remainingLessons)} / 总 ${escapeHtml(course.totalLessons)} 课时</p>${lowLessonWarning(course, threshold)}</div>
      <div class="course-actions">
        <button class="secondary" type="button" data-action="edit-course" data-course-id="${escapeHtml(course.id)}">编辑</button>
        <button class="secondary" type="button" data-action="toggle-course-active" data-course-id="${escapeHtml(course.id)}">${course.isActive ? '停用' : '启用'}</button>
        <button class="secondary" type="button" data-action="delete-course" data-course-id="${escapeHtml(course.id)}">删除</button>
      </div>
    </article>`,
    )
    .join('');

  const deletedCoursesSection = deletedCourses.length
    ? `<section class="deleted-section"><h3>已删除课程</h3><div class="course-list">${deletedCourses
      .map(
        (course) => `
      <article class="course-item">
        <div><strong>${escapeHtml(course.name)}</strong><p>${escapeHtml(scheduleSummary(course))} · 剩余 ${escapeHtml(course.remainingLessons)} / 总 ${escapeHtml(course.totalLessons)} 课时</p></div>
        <div class="course-actions"><button class="secondary" type="button" data-action="restore-course" data-course-id="${escapeHtml(course.id)}">恢复</button></div>
      </article>`,
      )
      .join('')}
    </div></section>`
    : '';

  const scheduleRows = (courseDraftSchedules.length > 0 ? courseDraftSchedules : [{ weekday: 1, time: '' }])
    .map((schedule, index) => {
      const weekday = Number(schedule.weekday);
      return `<div class="schedule-row" data-index="${index}">
    <label>上课星期
      <select name="scheduleWeekday" required>
        <option value="1" ${weekday === 1 ? 'selected' : ''}>周一</option>
        <option value="2" ${weekday === 2 ? 'selected' : ''}>周二</option>
        <option value="3" ${weekday === 3 ? 'selected' : ''}>周三</option>
        <option value="4" ${weekday === 4 ? 'selected' : ''}>周四</option>
        <option value="5" ${weekday === 5 ? 'selected' : ''}>周五</option>
        <option value="6" ${weekday === 6 ? 'selected' : ''}>周六</option>
        <option value="0" ${weekday === 0 ? 'selected' : ''}>周日</option>
      </select>
    </label>
    <label>上课时间<input name="scheduleTime" type="time" required value="${escapeHtml(schedule.time || '')}" /></label>
    <button class="secondary" type="button" data-action="remove-course-schedule" data-index="${index}" ${scheduleRowsLength(courseDraftSchedules) <= 1 ? 'disabled' : ''}>移除</button>
  </div>`;
    })
    .join('');

  return `<section class="card"><h2>课程管理</h2><form class="form-grid" data-form="course">
  <label>课程名称<input name="name" required value="${formName}" placeholder="例如：钢琴课" /></label>
  <label class="full">上课安排
    <div class="schedule-list" data-schedule-list>
      ${scheduleRows}
      <button class="secondary" type="button" data-action="add-course-schedule">添加上课安排</button>
    </div>
  </label>
  <label>总课时<input name="totalLessons" type="number" min="0" step="0.5" value="${escapeHtml(formTotalLessons)}" /></label>
  <label>剩余课时<input name="remainingLessons" type="number" min="0" step="0.5" value="${escapeHtml(formRemainingLessons)}" /></label>
  <label>每次消耗<input name="defaultLessonCost" type="number" min="0" step="0.5" value="${escapeHtml(formDefaultLessonCost)}" /></label>
  <label class="full">备注<textarea name="note" rows="2" placeholder="机构、老师或注意事项">${formNote}</textarea></label>
  <button class="primary" type="submit">${editingCourse ? '保存课程' : '新增课程'}</button>
  ${editingCourse ? '<button class="secondary" type="button" data-action="cancel-edit-course">取消编辑</button>' : ''}
</form><div class="course-list">${normalCourses || '<p class="muted">还没有课程。</p>'}</div>${deletedCoursesSection}</section>`;
}

function scheduleRowsLength(courseDraftSchedules) {
  return (courseDraftSchedules && courseDraftSchedules.length > 0) ? courseDraftSchedules.length : 1;
}

function renderRecordsPage(state, filters = {}, editingRecord = null, today = '') {
  const activeRecords = filterRecords(state.records, filters);
  const courseById = new Map(state.courses.map((course) => [course.id, course]));
  const deletedRecords = state.records
    .filter((record) => record.deletedAt)
    .filter((record) => {
      if (filters.courseId && record.courseId !== filters.courseId) return false;
      if (filters.status && record.status !== filters.status) return false;
      if (filters.from && record.date < filters.from) return false;
      if (filters.to && record.date > filters.to) return false;
      return true;
    });

  const recordsList = activeRecords
    .map((record) => {
      const course = courseById.get(record.courseId);
      const editButton = course && !course.deletedAt
        ? `<button class="secondary" type="button" data-action="edit-record" data-record-id="${escapeHtml(record.id)}">编辑</button>`
        : '';
      return `
    <article class="record-item">
      <strong>${escapeHtml(record.date)} ${escapeHtml(record.courseNameSnapshot)}</strong>
      <p>${escapeHtml(STATUS_LABELS[record.status] || record.status)} · 消耗 ${escapeHtml(record.lessonCost)} 课时</p>
      <p>${escapeHtml(record.feedback || record.homework || record.note)}</p>
      <div class="course-actions">
        ${editButton}
        <button class="secondary" type="button" data-action="delete-record" data-record-id="${escapeHtml(record.id)}">删除</button>
      </div>
    </article>`;
    })
    .join('');

  const deletedSection = deletedRecords.length
    ? `<section class="deleted-section"><h3>已删除记录</h3><div class="record-list">${deletedRecords
      .map((record) => `
      <article class="record-item">
        <strong>${escapeHtml(record.date)} ${escapeHtml(record.courseNameSnapshot)}</strong>
        <p>${escapeHtml(STATUS_LABELS[record.status] || record.status)} · 消耗 ${escapeHtml(record.lessonCost)} 课时</p>
        <p>${escapeHtml(record.feedback || record.homework || record.note)}</p>
        <div class="course-actions"><button class="secondary" type="button" data-action="restore-record" data-record-id="${escapeHtml(record.id)}">恢复</button></div>
      </article>`)
      .join('')}
    </div></section>`
    : '';

  const courseOptions = state.courses
    .filter((course) => !course.deletedAt)
    .map((course) => `<option value="${escapeHtml(course.id)}" ${filters.courseId === course.id ? 'selected' : ''}>${escapeHtml(course.name)}</option>`)
    .join('');
  const statusOptions = Object.entries(STATUS_LABELS)
    .map(([value, label]) => `<option value="${escapeHtml(value)}" ${filters.status === value ? 'selected' : ''}>${escapeHtml(label)}</option>`)
    .join('');

  const editingCourse = editingRecord ? courseById.get(editingRecord.courseId) : null;
  const canEditRecord = Boolean(editingCourse && !editingRecord.deletedAt && !editingCourse.deletedAt);
  const editForm = canEditRecord
    ? `<h3>编辑记录</h3>${renderRecordForm(state.courses, state.records, today, editingRecord)}`
    : '';

  return `<section class="card"><h2>记录查询</h2>${editForm}<form class="form-grid compact" data-form="record-filter">
  <label>课程
    <select name="courseId">
      <option value="">全部课程</option>
      ${courseOptions}
    </select>
  </label>
  <label>状态
    <select name="status">
      <option value="">全部状态</option>
      ${statusOptions}
    </select>
  </label>
  <label>开始日期<input name="from" type="date" value="${escapeHtml(filters.from || '')}" /></label>
  <label>结束日期<input name="to" type="date" value="${escapeHtml(filters.to || '')}" /></label>
  <button class="primary" type="submit">筛选记录</button>
</form><div class="record-list">${recordsList || '<p class="muted">还没有打卡记录。</p>'}</div>${deletedSection}</section>`;
}

function renderStatsPage(state, today) {
  const stats = summarizeCourseStats(state.courses, state.records, today);
  const courseById = new Map(state.courses.map((course) => [course.id, course]));
  const lowLessonThreshold = Number(state.settings?.lowLessonThreshold);
  const threshold = Number.isFinite(lowLessonThreshold) ? lowLessonThreshold : 3;
  const items = stats
    .map((item) => {
      const course = courseById.get(item.courseId);
      const isLowLessons = !course?.deletedAt && item.remainingLessons <= threshold;
      const warning = isLowLessons ? `<p class="low-lesson-alert">课时不足</p>` : '';
      return `
    <article class="stat-card">
      <strong>${escapeHtml(item.courseName)}</strong>
      <p>剩余：${escapeHtml(item.remainingLessons)} 课时</p>
      <p>本月消耗：${escapeHtml(item.monthLessonCost)} 课时</p>
      <p>本月已上课：${escapeHtml(item.monthCompletedCount)} 次</p>
      <p>本月请假/调课：${escapeHtml(item.monthLeaveOrRescheduledCount)} 次</p>
      <p>待补：${escapeHtml(item.pendingMakeups)} 次 · 已补：${escapeHtml(item.completedMakeups)} 次</p>
      <p>最近上课：${escapeHtml(item.lastClassDate || '无')}</p>
      ${warning}
    </article>`;
    })
    .join('');

  return `<section class="card"><h2>课时统计</h2><div class="stats-grid">${items || '<p class="muted">添加课程和记录后会显示统计。</p>'}</div></section>`;
}

function renderSettingsPage(state) {
  const threshold = Number.isFinite(Number(state?.settings?.lowLessonThreshold)) ? Number(state.settings.lowLessonThreshold) : 3;
  return `<section class="card"><h2>设置备份</h2><form class="form-grid compact" data-form="settings"><label>低课时阈值<input name="lowLessonThreshold" type="number" min="0" step="1" value="${escapeHtml(threshold)}" /></label><button class="primary" type="submit">保存设置</button></form><div class="actions"><button class="primary" data-action="export-json">导出 JSON 备份</button><button data-action="export-csv">导出 CSV 记录</button><label class="file-button">导入 JSON 备份<input type="file" accept="application/json" data-action="import-json" /></label></div><p class="muted">导入前会自动备份当前数据，导入会用备份内容覆盖当前浏览器数据。</p></section>`;
}

function renderPage(state, page, today, recordFilters, courseDraftSchedules, editingCourseId, editingRecordId) {
  if (page === PAGES.COURSES) return renderCoursesPage(state, courseDraftSchedules, editingCourseId);
  if (page === PAGES.RECORDS) {
    const editingRecord = state.records.find((record) => record.id === editingRecordId) || null;
    return renderRecordsPage(state, recordFilters, editingRecord, today);
  }
  if (page === PAGES.STATS) return renderStatsPage(state, today);
  if (page === PAGES.SETTINGS) return renderSettingsPage(state);
  return renderTodayPage(state, today);
}

export function renderApp({ state, page = PAGES.TODAY, today, recordFilters = {}, courseDraftSchedules, editingCourseId = '', editingRecordId = '' }) {
  return `
    <header class="hero"><h1>兴趣班打卡</h1><p>今日优先，顺手记录课时、作业和补课。</p></header>
    <nav class="top-nav">
      ${navItem(PAGES.TODAY, page, '今日打卡')}
      ${navItem(PAGES.COURSES, page, '课程管理')}
      ${navItem(PAGES.RECORDS, page, '记录查询')}
      ${navItem(PAGES.STATS, page, '课时统计')}
      ${navItem(PAGES.SETTINGS, page, '设置备份')}
    </nav>
    ${renderPage(state, page, today, recordFilters, courseDraftSchedules, editingCourseId, editingRecordId)}
  `;
}
