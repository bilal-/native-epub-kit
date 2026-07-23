import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const FORBIDDEN_COMMANDS = [
  /\bnpm\s+publish\b/i,
  /\bpnpm\s+publish\b/i,
  /\bchangeset\s+publish\b/i,
  /\bgit\s+push\b/i,
];

function hasWritePermission(permissions) {
  if (permissions === 'write-all' || permissions === 'write') return true;
  if (!permissions || typeof permissions !== 'object') return false;
  return Object.values(permissions).some((value) => value === 'write');
}

export function validateWorkflowSource(source, filename) {
  const errors = [];
  let workflow;

  try {
    workflow = YAML.parse(source);
  } catch (error) {
    return [`${filename}: invalid YAML: ${error.message}`];
  }

  if (!workflow || typeof workflow !== 'object') {
    return [`${filename}: workflow must be a YAML object`];
  }

  if (!workflow.name) errors.push(`${filename}: missing name`);
  if (!workflow.on) errors.push(`${filename}: missing on trigger`);
  if (!workflow.jobs || typeof workflow.jobs !== 'object') {
    errors.push(`${filename}: missing jobs`);
  }

  const triggers = workflow.on;
  if (
    triggers === 'pull_request_target' ||
    (triggers && typeof triggers === 'object' && 'pull_request_target' in triggers)
  ) {
    errors.push(`${filename}: pull_request_target is forbidden`);
  }

  for (const pattern of FORBIDDEN_COMMANDS) {
    if (pattern.test(source)) {
      errors.push(`${filename}: publishing or pushing command is forbidden`);
    }
  }

  for (const match of source.matchAll(/uses:\s*([^\s#]+)/g)) {
    const reference = match[1];
    if (reference.startsWith('./')) continue;

    const separator = reference.lastIndexOf('@');
    const revision = separator >= 0 ? reference.slice(separator + 1) : '';
    if (!/^[0-9a-f]{40}$/.test(revision)) {
      errors.push(`${filename}: action must be pinned to a full commit SHA: ${reference}`);
    }
  }

  const jobs = Object.values(workflow.jobs ?? {});
  const permissionBlocks = [workflow.permissions, ...jobs.map((job) => job?.permissions)];
  if (permissionBlocks.some(hasWritePermission)) {
    errors.push(`${filename}: write permissions are forbidden`);
  }

  return errors;
}

export function validateWorkflowDirectory(directory) {
  const workflowFiles = readdirSync(directory)
    .filter((file) => /\.ya?ml$/.test(file))
    .sort();

  if (workflowFiles.length === 0) {
    return [`${directory}: no workflow files found`];
  }

  return workflowFiles.flatMap((file) => {
    const path = resolve(directory, file);
    return validateWorkflowSource(readFileSync(path, 'utf8'), file);
  });
}

function run() {
  const directory = resolve('.github/workflows');
  const errors = validateWorkflowDirectory(directory);

  if (errors.length > 0) {
    errors.forEach((error) => console.error(error));
    process.exitCode = 1;
    return;
  }

  console.log('GitHub workflow validation passed.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  run();
}
