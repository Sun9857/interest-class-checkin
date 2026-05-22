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

function renderRecordForm(courses, records, today) {
  const madeUpIds = new Set(records
    .filter((record) => record.status === CHECKIN_STATUS.MAKEUP_COMPLETED && record.makeupForRecordId)
    .map((record) => record.makeupForRecordId));
  const makeupOptions = records
    .filter((record) => (record.status === CHECKIN_STATUS.LEAVE || record.status === CHECKIN_STATUS.RESCHEDULED) && !madeUpIds.has(record.id))
    .map((record) => `<option value="${escapeHtml(record.id)}">${escapeHtml(record.date)} · ${escapeHtml(record.courseNameSnapshot)} · ${escapeHtml(STATUS_LABELS[record.status] || record.status)}</option>`)
    .join('');
  const makeupField = makeupOptions
    ? `<label class="full">关联请假/调课记录<select name="makeupForRecordId"><option value="">不关联</option>${makeupOptions}</select></label>`
    : '';

  return `<form class="form-grid" data-form="record">
    <label>课程
      <select name="courseId" required>
        ${courses.map((course) => `<option value="${escapeHtml(course.id)}">${escapeHtml(course.name)}</option>`).join('')}
      </select>
    </label>
    <label>日期<input name="date" type="date" value="${escapeHtml(today)}" required /></label>
    <label>时间<input name="time" type="time" /></label>
    <label>类型
      <select name="type">
        <option value="${RECORD_TYPE.SCHEDULED}">固定课</option>
        <option value="${RECORD_TYPE.TEMPORARY}">临时课</option>
        <option value="${RECORD_TYPE.MAKEUP}">补课</option>
      </select>
    </label>
    <label>状态
      <select name="status">
        <option value="${CHECKIN_STATUS.COMPLETED}">已上课</option>
        <option value="${CHECKIN_STATUS.LEAVE}">请假</option>
        <option value="${CHECKIN_STATUS.RESCHEDULED}">调课</option>
        <option value="${CHECKIN_STATUS.MAKEUP_COMPLETED}">已补课</option>
        <option value="${CHECKIN_STATUS.CANCELLED}">取消</option>
      </select>
    </label>
    <label>消耗课时<input name="lessonCost" type="number" min="0" step="0.5" value="1" /></label>
    ${makeupField}
    <label class="full">作业内容<textarea name="homework" rows="2"></textarea></label>
    <label class="full">老师反馈<textarea name="feedback" rows="2"></textarea></label>
    <label class="full">备注<textarea name="note" rows="2"></textarea></label>
    <button class="primary" type="submit">保存打卡记录</button>
  </form>`;
}

function renderTodayPage(state, today) {
  const scheduledCourses = getCoursesForDate(state.courses, today);
  if (state.courses.length === 0) {
    return `<section class="card"><h2>今日打卡</h2><p class="muted">今天没有固定课程。</p><p class="muted">请先在课程管理中新增课程，再添加记录。</p></section>`;
  }

  const scheduledList = scheduledCourses.length
    ? `<div class="course-list">${scheduledCourses
      .map(
        (course) => `
    <article class="course-item">
      <div><strong>${escapeHtml(course.name)}</strong><p>${escapeHtml(course.time)} · 剩余 ${escapeHtml(course.remainingLessons)} 课时</p></div>
    </article>`,
      )
      .join('')}</div>`
    : '<p class="muted">今天没有固定课程，可以在下方添加临时课或补课记录。</p>';

  return `<section class="card"><h2>今日打卡</h2>${scheduledList}<h3>添加临时/补课</h3>${renderRecordForm(state.courses, state.records, today)}</section>`;
}

function renderCoursesPage(state) {
  const items = state.courses
    .map(
      (course) => `
    <article class="course-item">
      <div><strong>${escapeHtml(course.name)}</strong><p>${escapeHtml(course.time)} · 剩余 ${escapeHtml(course.remainingLessons)} / 总 ${escapeHtml(course.totalLessons)} 课时</p></div>
    </article>`,
    )
    .join('');

  return `<section class="card"><h2>课程管理</h2><form class="form-grid" data-form="course">
  <label>课程名称<input name="name" required placeholder="例如：钢琴课" /></label>
  <label>上课星期
    <select name="weekday" required>
      <option value="1">周一</option>
      <option value="2">周二</option>
      <option value="3">周三</option>
      <option value="4">周四</option>
      <option value="5">周五</option>
      <option value="6">周六</option>
      <option value="0">周日</option>
    </select>
  </label>
  <label>上课时间<input name="time" type="time" required /></label>
  <label>总课时<input name="totalLessons" type="number" min="0" step="0.5" value="0" /></label>
  <label>剩余课时<input name="remainingLessons" type="number" min="0" step="0.5" value="0" /></label>
  <label>每次消耗<input name="defaultLessonCost" type="number" min="0" step="0.5" value="1" /></label>
  <label class="full">备注<textarea name="note" rows="2" placeholder="机构、老师或注意事项"></textarea></label>
  <button class="primary" type="submit">新增课程</button>
</form><div class="course-list">${items || '<p class="muted">还没有课程。</p>'}</div></section>`;
}

function renderRecordsPage(state, filters = {}) {
  const records = filterRecords(state.records, filters);
  const items = records
    .map(
      (record) => `
    <article class="record-item">
      <strong>${escapeHtml(record.date)} ${escapeHtml(record.courseNameSnapshot)}</strong>
      <p>${escapeHtml(STATUS_LABELS[record.status] || record.status)} · 消耗 ${escapeHtml(record.lessonCost)} 课时</p>
      <p>${escapeHtml(record.feedback || record.homework || record.note)}</p>
    </article>`,
    )
    .join('');
  const courseOptions = state.courses
    .map((course) => `<option value="${escapeHtml(course.id)}" ${filters.courseId === course.id ? 'selected' : ''}>${escapeHtml(course.name)}</option>`)
    .join('');
  const statusOptions = Object.entries(STATUS_LABELS)
    .map(([value, label]) => `<option value="${escapeHtml(value)}" ${filters.status === value ? 'selected' : ''}>${escapeHtml(label)}</option>`)
    .join('');

  return `<section class="card"><h2>记录查询</h2><form class="form-grid compact" data-form="record-filter">
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
</form><div class="record-list">${items || '<p class="muted">还没有打卡记录。</p>'}</div></section>`;
}

function renderStatsPage(state, today) {
  const stats = summarizeCourseStats(state.courses, state.records, today);
  const items = stats
    .map(
      (item) => `
    <article class="stat-card">
      <strong>${escapeHtml(item.courseName)}</strong>
      <p>剩余：${escapeHtml(item.remainingLessons)} 课时</p>
      <p>本月消耗：${escapeHtml(item.monthLessonCost)} 课时</p>
      <p>待补：${escapeHtml(item.pendingMakeups)} 次 · 已补：${escapeHtml(item.completedMakeups)} 次</p>
      <p>最近上课：${escapeHtml(item.lastClassDate || '无')}</p>
    </article>`,
    )
    .join('');

  return `<section class="card"><h2>课时统计</h2><div class="stats-grid">${items || '<p class="muted">添加课程和记录后会显示统计。</p>'}</div></section>`;
}

function renderSettingsPage() {
  return `<section class="card"><h2>设置备份</h2><div class="actions"><button class="primary" data-action="export-json">导出 JSON 备份</button><button data-action="export-csv">导出 CSV 记录</button><label class="file-button">导入 JSON 备份<input type="file" accept="application/json" data-action="import-json" /></label></div><p class="muted">导入会用备份内容覆盖当前浏览器数据。</p></section>`;
}

function renderPage(state, page, today, recordFilters) {
  if (page === PAGES.COURSES) return renderCoursesPage(state);
  if (page === PAGES.RECORDS) return renderRecordsPage(state, recordFilters);
  if (page === PAGES.STATS) return renderStatsPage(state, today);
  if (page === PAGES.SETTINGS) return renderSettingsPage();
  return renderTodayPage(state, today);
}

export function renderApp({ state, page = PAGES.TODAY, today, recordFilters = {} }) {
  return `
    <header class="hero"><h1>兴趣班打卡</h1><p>今日优先，顺手记录课时、作业和补课。</p></header>
    <nav class="top-nav">
      ${navItem(PAGES.TODAY, page, '今日打卡')}
      ${navItem(PAGES.COURSES, page, '课程管理')}
      ${navItem(PAGES.RECORDS, page, '记录查询')}
      ${navItem(PAGES.STATS, page, '课时统计')}
      ${navItem(PAGES.SETTINGS, page, '设置备份')}
    </nav>
    ${renderPage(state, page, today, recordFilters)}
  `;
}
