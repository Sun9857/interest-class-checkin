import { STATUS_LABELS, TYPE_LABELS } from './domain.js';
import { normalizeState } from './state.js';

export function createBackup(state, exportedAt = new Date().toISOString()) {
  const normalized = normalizeState(state);
  return {
    version: 2,
    exportedAt,
    courses: normalized.courses,
    records: normalized.records,
    settings: normalized.settings,
  };
}

export function parseBackup(jsonText) {
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error('备份文件格式不正确');
  }

  if (
    !parsed
    || typeof parsed !== 'object'
    || ![1, 2].includes(parsed.version)
    || !Array.isArray(parsed.courses)
    || !Array.isArray(parsed.records)
  ) {
    throw new Error('备份文件格式不正确');
  }
  return normalizeState(parsed);
}

function csvCell(value) {
  const rawText = String(value ?? '');
  const text = /^[\s\x00-\x1f]*[=+\-@]/.test(rawText) ? `'${rawText}` : rawText;
  if (/[",\r\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

export function recordsToCsv(records) {
  const header = ['日期', '时间', '课程', '类型', '状态', '消耗课时', '作业', '反馈', '备注'];
  const rows = records.map((record) => [
    record.date,
    record.time,
    record.courseNameSnapshot,
    TYPE_LABELS[record.type] || record.type,
    STATUS_LABELS[record.status] || record.status,
    record.lessonCost,
    record.homework,
    record.feedback,
    record.note,
  ]);

  return `﻿${[header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}`;
}
