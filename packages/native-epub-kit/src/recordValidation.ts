import {
  DECORATION_STYLE_TYPES,
  FOOTNOTE_CLASSIFICATIONS,
  NATIVE_PLATFORMS,
  NAVIGATION_UNIT_SOURCES,
  PROGRESS_PRECISIONS,
  PUBLICATION_LAYOUTS,
  PUBLICATION_SOURCE_KINDS,
  READER_LOCATION_REASONS,
  READER_LINK_DISPOSITIONS,
  READER_LINK_KINDS,
  READER_IMAGE_SOURCE_KINDS,
  READER_IMAGE_UNRESOLVED_REASONS,
  READER_SELECTION_CHANGE_REASONS,
  READER_ERROR_CODES,
  READER_ERROR_PHASES,
  READING_PROGRESSIONS,
  TEXT_DIRECTIONS,
  type CoreRecordMap,
  type CoreRecordType,
  type FootnoteEvent,
  type JsonObject,
  type JsonValue,
  type Locator,
  type NavigationUnit,
  type PublicationLink,
  type PublicationSource,
  type PublicationInfo,
  type PublicationPositionsPage,
  type PublicationSummary,
  type ReaderDecoration,
  type ReaderDecorationActivationEvent,
  type ReaderError,
  type ReaderGeometry,
  type ReaderImageActivationEvent,
  type ReaderResolvedImageSource,
  type ReaderLocationEvent,
  type ReaderLinkEvent,
  type ReaderSelection,
  type ReaderSelectionActionEvent,
  type ReaderSelectionChangeEvent,
  type ReaderSelectionSnapshot,
} from './records.ts';

const progressPrecisions = new Set<string>(PROGRESS_PRECISIONS);
const locationReasons = new Set<string>(READER_LOCATION_REASONS);
const readingProgressions = new Set<string>(READING_PROGRESSIONS);
const textDirections = new Set<string>(TEXT_DIRECTIONS);
const readerErrorCodes = new Set<string>(READER_ERROR_CODES);
const readerErrorPhases = new Set<string>(READER_ERROR_PHASES);
const readerLinkDispositions = new Set<string>(READER_LINK_DISPOSITIONS);
const readerLinkKinds = new Set<string>(READER_LINK_KINDS);
const readerImageSourceKinds = new Set<string>(READER_IMAGE_SOURCE_KINDS);
const readerImageUnresolvedReasons = new Set<string>(READER_IMAGE_UNRESOLVED_REASONS);
const readerSelectionChangeReasons = new Set<string>(READER_SELECTION_CHANGE_REASONS);

export class RecordValidationError extends TypeError {
  readonly code = 'INVALID_RECORD';

  constructor(
    readonly path: string,
    message: string
  ) {
    super(`${path}: ${message}`);
    this.name = 'RecordValidationError';
  }
}

function fail(path: string, message: string): never {
  throw new RecordValidationError(path, message);
}

function cloneJson(value: unknown, path = '$', ancestors = new WeakSet<object>()): JsonValue {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail(path, 'must be a finite JSON number');
    return value;
  }
  if (typeof value !== 'object') fail(path, 'must be JSON-serializable');
  if (ancestors.has(value)) fail(path, 'must not contain a cycle');

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((item, index) => cloneJson(item, `${path}/${index}`, ancestors));
    }

    const result: JsonObject = {};
    for (const [key, item] of Object.entries(value)) {
      if (item === undefined) fail(`${path}/${key}`, 'must be omitted instead of undefined');
      result[key] = cloneJson(item, `${path}/${key}`, ancestors);
    }
    return result;
  } finally {
    ancestors.delete(value);
  }
}

function object(value: unknown, path: string): JsonObject {
  const cloned = cloneJson(value, path);
  if (cloned === null || Array.isArray(cloned) || typeof cloned !== 'object') {
    fail(path, 'must be an object');
  }
  return cloned;
}

function required(objectValue: JsonObject, key: string, path: string): JsonValue {
  if (!Object.hasOwn(objectValue, key)) fail(`${path}/${key}`, 'is required');
  return objectValue[key]!;
}

function string(value: JsonValue, path: string, allowEmpty = false): string {
  if (typeof value !== 'string' || (!allowEmpty && value.length === 0)) {
    fail(path, allowEmpty ? 'must be a string' : 'must be a non-empty string');
  }
  return value;
}

function boolean(value: JsonValue, path: string): boolean {
  if (typeof value !== 'boolean') fail(path, 'must be a boolean');
  return value;
}

function number(value: JsonValue, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(path, 'must be finite');
  return value;
}

function integer(value: JsonValue, path: string, minimum = 0): number {
  const parsed = number(value, path);
  if (!Number.isSafeInteger(parsed) || parsed < minimum) {
    fail(path, `must be a safe integer >= ${minimum}`);
  }
  return parsed;
}

function progression(value: JsonValue, path: string): number {
  const parsed = number(value, path);
  if (parsed < 0 || parsed > 1) fail(path, 'must be within 0...1');
  return parsed;
}

function stringArray(value: JsonValue, path: string): string[] {
  if (!Array.isArray(value)) fail(path, 'must be an array');
  return value.map((item, index) => string(item, `${path}/${index}`));
}

function optionalString(objectValue: JsonObject, key: string, path: string): void {
  if (Object.hasOwn(objectValue, key)) string(objectValue[key]!, `${path}/${key}`);
}

function optionalProgression(objectValue: JsonObject, key: string, path: string): void {
  if (Object.hasOwn(objectValue, key)) progression(objectValue[key]!, `${path}/${key}`);
}

function optionalPositiveInteger(objectValue: JsonObject, key: string, path: string): void {
  if (Object.hasOwn(objectValue, key)) integer(objectValue[key]!, `${path}/${key}`, 1);
}

function enumValue(value: JsonValue, allowed: ReadonlySet<string>, path: string): string {
  const parsed = string(value, path);
  if (!allowed.has(parsed)) fail(path, `has unsupported value ${JSON.stringify(parsed)}`);
  return parsed;
}

function validateLocatorObject(value: unknown, path: string): Locator {
  const parsed = object(value, path);
  string(required(parsed, 'href', path), `${path}/href`);
  string(required(parsed, 'type', path), `${path}/type`);
  if (Object.hasOwn(parsed, 'title') && parsed.title !== null) {
    string(parsed.title!, `${path}/title`, true);
  }

  if (Object.hasOwn(parsed, 'locations')) {
    const locations = object(parsed.locations, `${path}/locations`);
    if (Object.hasOwn(locations, 'fragments')) {
      stringArray(locations.fragments!, `${path}/locations/fragments`);
    }
    optionalProgression(locations, 'progression', `${path}/locations`);
    optionalProgression(locations, 'totalProgression', `${path}/locations`);
    optionalPositiveInteger(locations, 'position', `${path}/locations`);
  }

  if (Object.hasOwn(parsed, 'text')) {
    const text = object(parsed.text, `${path}/text`);
    optionalString(text, 'before', `${path}/text`);
    optionalString(text, 'highlight', `${path}/text`);
    optionalString(text, 'after', `${path}/text`);
  }
  return parsed as unknown as Locator;
}

function validateRect(value: unknown, path: string): void {
  const parsed = object(value, path);
  number(required(parsed, 'x', path), `${path}/x`);
  number(required(parsed, 'y', path), `${path}/y`);
  const width = number(required(parsed, 'width', path), `${path}/width`);
  const height = number(required(parsed, 'height', path), `${path}/height`);
  if (width < 0) fail(`${path}/width`, 'must be >= 0');
  if (height < 0) fail(`${path}/height`, 'must be >= 0');
}

function validateGeometryObject(value: unknown, path: string): ReaderGeometry {
  const parsed = object(value, path);
  const coordinateSpace = string(
    required(parsed, 'coordinateSpace', path),
    `${path}/coordinateSpace`
  );
  if (coordinateSpace !== 'reader-view-and-window-v1') {
    fail(`${path}/coordinateSpace`, 'must be reader-view-and-window-v1');
  }
  const viewport = object(required(parsed, 'viewport', path), `${path}/viewport`);
  const viewportWidth = number(
    required(viewport, 'width', `${path}/viewport`),
    `${path}/viewport/width`
  );
  const viewportHeight = number(
    required(viewport, 'height', `${path}/viewport`),
    `${path}/viewport/height`
  );
  if (viewportWidth <= 0 || viewportHeight <= 0) {
    fail(`${path}/viewport`, 'width and height must be > 0');
  }
  if (Object.hasOwn(parsed, 'viewRect')) validateRect(parsed.viewRect, `${path}/viewRect`);
  if (Object.hasOwn(parsed, 'visibleViewRect')) {
    validateRect(parsed.visibleViewRect, `${path}/visibleViewRect`);
  }
  if (Object.hasOwn(parsed, 'windowRect')) validateRect(parsed.windowRect, `${path}/windowRect`);
  if (Object.hasOwn(parsed, 'visibleWindowRect')) {
    validateRect(parsed.visibleWindowRect, `${path}/visibleWindowRect`);
  }
  return parsed as unknown as ReaderGeometry;
}

function validatePublicationSourceObject(value: unknown, path: string): PublicationSource {
  const parsed = object(value, path);
  const kind = enumValue(
    required(parsed, 'kind', path),
    new Set<string>(PUBLICATION_SOURCE_KINDS),
    `${path}/kind`
  );
  if (kind === 'remote') {
    string(required(parsed, 'url', path), `${path}/url`);
    if (Object.hasOwn(parsed, 'headers')) {
      const headers = object(parsed.headers, `${path}/headers`);
      for (const [key, headerValue] of Object.entries(headers)) {
        string(headerValue, `${path}/headers/${key}`, true);
      }
    }
  } else {
    string(required(parsed, 'uri', path), `${path}/uri`);
  }
  return parsed as unknown as PublicationSource;
}

function validateContributor(value: JsonValue, path: string): void {
  const parsed = object(value, path);
  string(required(parsed, 'name', path), `${path}/name`);
  optionalString(parsed, 'identifier', path);
  optionalString(parsed, 'sortAs', path);
  if (Object.hasOwn(parsed, 'roles')) stringArray(parsed.roles!, `${path}/roles`);
}

function validatePublicationLink(value: JsonValue, path: string, depth = 0): void {
  if (depth > 256) fail(path, 'link nesting exceeds 256 levels');
  const parsed = object(value, path);
  string(required(parsed, 'href', path), `${path}/href`);
  optionalString(parsed, 'title', path);
  optionalString(parsed, 'type', path);
  if (Object.hasOwn(parsed, 'rel')) stringArray(parsed.rel!, `${path}/rel`);
  if (Object.hasOwn(parsed, 'properties')) object(parsed.properties, `${path}/properties`);
  const children = required(parsed, 'children', path);
  if (!Array.isArray(children)) fail(`${path}/children`, 'must be an array');
  children.forEach((child, index) =>
    validatePublicationLink(child, `${path}/children/${index}`, depth + 1)
  );
}

/** Validates and detaches one public publication link tree. */
export function parsePublicationLink(value: unknown): PublicationLink {
  const parsed = cloneJson(value);
  validatePublicationLink(parsed, '$');
  return parsed as unknown as PublicationLink;
}

function validateCapabilities(value: JsonValue, path: string): void {
  const parsed = object(value, path);
  for (const key of ['customFonts', 'decorations', 'footnotes', 'images', 'search', 'selection']) {
    boolean(required(parsed, key, path), `${path}/${key}`);
  }
  enumValue(
    required(parsed, 'progressPrecision', path),
    progressPrecisions,
    `${path}/progressPrecision`
  );
  stringArray(required(parsed, 'warnings', path), `${path}/warnings`);
}

function validatePublicationSummaryObject(value: unknown, path: string): PublicationSummary {
  const parsed = object(value, path);
  string(required(parsed, 'title', path), `${path}/title`);
  optionalString(parsed, 'identifier', path);
  optionalString(parsed, 'subtitle', path);
  if (Object.hasOwn(parsed, 'readingProgression')) {
    enumValue(parsed.readingProgression!, readingProgressions, `${path}/readingProgression`);
  }
  enumValue(
    required(parsed, 'layout', path),
    new Set<string>(PUBLICATION_LAYOUTS),
    `${path}/layout`
  );
  stringArray(required(parsed, 'languages', path), `${path}/languages`);

  const authors = required(parsed, 'authors', path);
  if (!Array.isArray(authors)) fail(`${path}/authors`, 'must be an array');
  authors.forEach((author, index) => validateContributor(author, `${path}/authors/${index}`));

  for (const key of ['tableOfContents', 'readingOrder'] as const) {
    const links = required(parsed, key, path);
    if (!Array.isArray(links)) fail(`${path}/${key}`, 'must be an array');
    links.forEach((link, index) => validatePublicationLink(link, `${path}/${key}/${index}`));
  }
  const positions = required(parsed, 'positions', path);
  if (!Array.isArray(positions)) fail(`${path}/positions`, 'must be an array');
  positions.forEach((locator, index) =>
    validateLocatorObject(locator, `${path}/positions/${index}`)
  );
  validateCapabilities(required(parsed, 'capabilities', path), `${path}/capabilities`);
  return parsed as unknown as PublicationSummary;
}

function validatePublicationInfoObject(value: unknown, path: string): PublicationInfo {
  const parsed = object(value, path);
  validatePublicationSummaryObject({ ...parsed, positions: [] }, path);
  string(required(parsed, 'instanceId', path), `${path}/instanceId`);
  integer(required(parsed, 'generation', path), `${path}/generation`);
  integer(required(parsed, 'positionCount', path), `${path}/positionCount`);
  return parsed as unknown as PublicationInfo;
}

function validatePublicationPositionsPageObject(
  value: unknown,
  path: string
): PublicationPositionsPage {
  const parsed = object(value, path);
  string(required(parsed, 'instanceId', path), `${path}/instanceId`);
  integer(required(parsed, 'generation', path), `${path}/generation`);
  const offset = integer(required(parsed, 'offset', path), `${path}/offset`);
  const total = integer(required(parsed, 'total', path), `${path}/total`);
  if (offset > total) fail(`${path}/offset`, 'must not exceed total');
  const positions = required(parsed, 'positions', path);
  if (!Array.isArray(positions)) fail(`${path}/positions`, 'must be an array');
  if (positions.length > 256) fail(`${path}/positions`, 'must contain at most 256 locators');
  if (offset < total && positions.length === 0) {
    fail(`${path}/positions`, 'must not be empty before the final offset');
  }
  positions.forEach((locator, index) =>
    validateLocatorObject(locator, `${path}/positions/${index}`)
  );
  const end = offset + positions.length;
  if (end > total) fail(`${path}/positions`, 'extends beyond total');
  if (Object.hasOwn(parsed, 'nextOffset')) {
    const nextOffset = integer(parsed.nextOffset!, `${path}/nextOffset`);
    if (nextOffset !== end || nextOffset >= total) {
      fail(`${path}/nextOffset`, 'must equal the non-final page end');
    }
  } else if (end < total) {
    fail(`${path}/nextOffset`, 'is required before the final page');
  }
  return parsed as unknown as PublicationPositionsPage;
}

function validateNavigationUnitObject(value: unknown, path: string): NavigationUnit {
  const parsed = object(value, path);
  for (const key of ['id', 'title', 'href'] as const) {
    string(required(parsed, key, path), `${path}/${key}`);
  }
  integer(required(parsed, 'depth', path), `${path}/depth`);
  enumValue(
    required(parsed, 'source', path),
    new Set<string>(NAVIGATION_UNIT_SOURCES),
    `${path}/source`
  );
  stringArray(required(parsed, 'childIds', path), `${path}/childIds`);
  optionalString(parsed, 'parentId', path);
  validateLocatorObject(required(parsed, 'startLocator', path), `${path}/startLocator`);
  if (Object.hasOwn(parsed, 'endLocator'))
    validateLocatorObject(parsed.endLocator, `${path}/endLocator`);
  optionalPositiveInteger(parsed, 'startPosition', path);
  optionalPositiveInteger(parsed, 'endPositionExclusive', path);
  optionalProgression(parsed, 'startTotalProgression', path);
  optionalProgression(parsed, 'endTotalProgression', path);
  if (
    typeof parsed.startPosition === 'number' &&
    typeof parsed.endPositionExclusive === 'number' &&
    parsed.endPositionExclusive <= parsed.startPosition
  ) {
    fail(`${path}/endPositionExclusive`, 'must be greater than startPosition');
  }
  return parsed as unknown as NavigationUnit;
}

function validateLocationEventObject(value: unknown, path: string): ReaderLocationEvent {
  const parsed = object(value, path);
  string(required(parsed, 'instanceId', path), `${path}/instanceId`);
  integer(required(parsed, 'generation', path), `${path}/generation`);
  integer(required(parsed, 'sequence', path), `${path}/sequence`);
  validateLocatorObject(required(parsed, 'locator', path), `${path}/locator`);
  enumValue(required(parsed, 'reason', path), locationReasons, `${path}/reason`);
  enumValue(required(parsed, 'precision', path), progressPrecisions, `${path}/precision`);
  optionalProgression(parsed, 'chapterProgress', path);
  optionalProgression(parsed, 'overallProgress', path);
  optionalPositiveInteger(parsed, 'position', path);
  optionalPositiveInteger(parsed, 'totalPositions', path);
  if (Object.hasOwn(parsed, 'navigationUnit')) {
    validateNavigationUnitObject(parsed.navigationUnit, `${path}/navigationUnit`);
  }
  if (Object.hasOwn(parsed, 'visibleRange')) {
    const range = object(parsed.visibleRange, `${path}/visibleRange`);
    validateLocatorObject(
      required(range, 'start', `${path}/visibleRange`),
      `${path}/visibleRange/start`
    );
    validateLocatorObject(
      required(range, 'end', `${path}/visibleRange`),
      `${path}/visibleRange/end`
    );
  }
  return parsed as unknown as ReaderLocationEvent;
}

function validateSelectionObject(value: unknown, path: string): ReaderSelection {
  const parsed = object(value, path);
  validateLocatorObject(required(parsed, 'locator', path), `${path}/locator`);
  string(required(parsed, 'text', path), `${path}/text`, true);
  optionalString(parsed, 'language', path);
  optionalString(parsed, 'navigationUnitId', path);
  if (Object.hasOwn(parsed, 'copyAllowed')) {
    boolean(parsed.copyAllowed!, `${path}/copyAllowed`);
  }
  if (Object.hasOwn(parsed, 'truncated')) {
    boolean(parsed.truncated!, `${path}/truncated`);
  }
  if (Object.hasOwn(parsed, 'direction')) {
    enumValue(parsed.direction!, textDirections, `${path}/direction`);
  }
  if (Object.hasOwn(parsed, 'geometry')) {
    validateGeometryObject(parsed.geometry, `${path}/geometry`);
  }
  return parsed as unknown as ReaderSelection;
}

function validateSelectionSnapshotObject(value: unknown, path: string): ReaderSelectionSnapshot {
  const parsed = validateSelectionObject(value, path) as unknown as JsonObject;
  boolean(required(parsed, 'copyAllowed', path), `${path}/copyAllowed`);
  boolean(required(parsed, 'truncated', path), `${path}/truncated`);
  return parsed as unknown as ReaderSelectionSnapshot;
}

function validateSelectionIdentity(value: JsonObject, path: string): void {
  string(required(value, 'instanceId', path), `${path}/instanceId`);
  integer(required(value, 'generation', path), `${path}/generation`);
  integer(required(value, 'sequence', path), `${path}/sequence`);
  boolean(required(value, 'handlesActive', path), `${path}/handlesActive`);
  enumValue(
    required(value, 'platform', path),
    new Set<string>(NATIVE_PLATFORMS),
    `${path}/platform`
  );
}

function validateSelectionChangeEventObject(
  value: unknown,
  path: string
): ReaderSelectionChangeEvent {
  const parsed = object(value, path);
  validateSelectionIdentity(parsed, path);
  const reason = enumValue(
    required(parsed, 'reason', path),
    readerSelectionChangeReasons,
    `${path}/reason`
  );
  const selection = required(parsed, 'selection', path);
  const ended = reason === 'cleared' || reason === 'dismissed';
  if (ended) {
    if (selection !== null) fail(`${path}/selection`, `must be null when reason is ${reason}`);
    if (parsed.handlesActive !== false) {
      fail(`${path}/handlesActive`, `must be false when reason is ${reason}`);
    }
  } else {
    if (selection === null) fail(`${path}/selection`, `must be active when reason is ${reason}`);
    validateSelectionSnapshotObject(selection, `${path}/selection`);
  }
  return parsed as unknown as ReaderSelectionChangeEvent;
}

function validateSelectionActionEventObject(
  value: unknown,
  path: string
): ReaderSelectionActionEvent {
  const parsed = object(value, path);
  validateSelectionIdentity(parsed, path);
  string(required(parsed, 'actionId', path), `${path}/actionId`);
  validateSelectionSnapshotObject(required(parsed, 'selection', path), `${path}/selection`);
  return parsed as unknown as ReaderSelectionActionEvent;
}

function validateDecorationObject(value: unknown, path: string): ReaderDecoration {
  const parsed = object(value, path);
  string(required(parsed, 'id', path), `${path}/id`);
  validateLocatorObject(required(parsed, 'locator', path), `${path}/locator`);
  const style = object(required(parsed, 'style', path), `${path}/style`);
  const type = enumValue(
    required(style, 'type', `${path}/style`),
    new Set<string>(DECORATION_STYLE_TYPES),
    `${path}/style/type`
  );
  if (type === 'highlight' || type === 'underline') {
    string(required(style, 'tint', `${path}/style`), `${path}/style/tint`);
  }
  if ((type === 'highlight' || type === 'underline') && Object.hasOwn(style, 'isActive')) {
    boolean(style.isActive!, `${path}/style/isActive`);
  }
  if (type === 'margin-icon') {
    string(required(style, 'asset', `${path}/style`), `${path}/style/asset`);
    optionalString(style, 'tint', `${path}/style`);
  }
  if (type === 'custom') {
    string(required(style, 'template', `${path}/style`), `${path}/style/template`);
    if (Object.hasOwn(style, 'config')) cloneJson(style.config, `${path}/style/config`);
  }
  if (Object.hasOwn(parsed, 'data')) cloneJson(parsed.data, `${path}/data`);
  return parsed as unknown as ReaderDecoration;
}

function validateDecorationActivationEventObject(
  value: unknown,
  path: string
): ReaderDecorationActivationEvent {
  const parsed = object(value, path);
  string(required(parsed, 'instanceId', path), `${path}/instanceId`);
  integer(required(parsed, 'generation', path), `${path}/generation`);
  integer(required(parsed, 'sequence', path), `${path}/sequence`);
  enumValue(
    required(parsed, 'platform', path),
    new Set<string>(NATIVE_PLATFORMS),
    `${path}/platform`
  );
  string(required(parsed, 'group', path), `${path}/group`);
  validateDecorationObject(required(parsed, 'decoration', path), `${path}/decoration`);
  if (Object.hasOwn(parsed, 'geometry')) {
    validateGeometryObject(parsed.geometry, `${path}/geometry`);
  }
  return parsed as unknown as ReaderDecorationActivationEvent;
}

function validateFootnoteObject(value: unknown, path: string): FootnoteEvent {
  const parsed = object(value, path);
  string(required(parsed, 'instanceId', path), `${path}/instanceId`);
  integer(required(parsed, 'generation', path), `${path}/generation`);
  string(required(parsed, 'href', path), `${path}/href`);
  string(required(parsed, 'text', path), `${path}/text`, true);
  boolean(required(parsed, 'truncated', path), `${path}/truncated`);
  enumValue(
    required(parsed, 'platform', path),
    new Set<string>(NATIVE_PLATFORMS),
    `${path}/platform`
  );
  enumValue(
    required(parsed, 'classification', path),
    new Set<string>(FOOTNOTE_CLASSIFICATIONS),
    `${path}/classification`
  );
  validateLocatorObject(required(parsed, 'sourceLocator', path), `${path}/sourceLocator`);
  if (Object.hasOwn(parsed, 'targetLocator')) {
    validateLocatorObject(parsed.targetLocator, `${path}/targetLocator`);
  }
  for (const key of ['id', 'referrer', 'contentType', 'html', 'language'] as const) {
    optionalString(parsed, key, path);
  }
  if (Object.hasOwn(parsed, 'direction')) {
    enumValue(parsed.direction!, textDirections, `${path}/direction`);
  }
  if (Object.hasOwn(parsed, 'geometry')) {
    validateGeometryObject(parsed.geometry, `${path}/geometry`);
  }
  return parsed as unknown as FootnoteEvent;
}

function validateReaderLinkObject(value: unknown, path: string): ReaderLinkEvent {
  const parsed = object(value, path);
  string(required(parsed, 'instanceId', path), `${path}/instanceId`);
  integer(required(parsed, 'generation', path), `${path}/generation`);
  string(required(parsed, 'href', path), `${path}/href`);
  enumValue(
    required(parsed, 'platform', path),
    new Set<string>(NATIVE_PLATFORMS),
    `${path}/platform`
  );
  enumValue(required(parsed, 'kind', path), readerLinkKinds, `${path}/kind`);
  enumValue(required(parsed, 'disposition', path), readerLinkDispositions, `${path}/disposition`);
  validateLocatorObject(required(parsed, 'sourceLocator', path), `${path}/sourceLocator`);
  if (Object.hasOwn(parsed, 'targetLocator')) {
    validateLocatorObject(parsed.targetLocator, `${path}/targetLocator`);
  }
  for (const key of ['contentType', 'referrer', 'scheme'] as const) {
    optionalString(parsed, key, path);
  }
  if (Object.hasOwn(parsed, 'geometry')) {
    validateGeometryObject(parsed.geometry, `${path}/geometry`);
  }
  return parsed as unknown as ReaderLinkEvent;
}

function validateImageContentType(value: JsonValue, path: string): string {
  const contentType = string(value, path).trim().toLowerCase();
  if (!contentType.startsWith('image/') || contentType.length > 128) {
    fail(path, 'must be a bounded image media type');
  }
  return contentType;
}

function validateReaderImageSourceObject(value: unknown, path: string): void {
  const parsed = object(value, path);
  const kind = enumValue(required(parsed, 'kind', path), readerImageSourceKinds, `${path}/kind`);
  const resolvable = boolean(required(parsed, 'resolvable', path), `${path}/resolvable`);
  optionalString(parsed, 'href', path);
  optionalString(parsed, 'handle', path);
  if (Object.hasOwn(parsed, 'contentType')) {
    validateImageContentType(parsed.contentType!, `${path}/contentType`);
  }
  if (Object.hasOwn(parsed, 'unresolvedReason')) {
    enumValue(parsed.unresolvedReason!, readerImageUnresolvedReasons, `${path}/unresolvedReason`);
  }

  const href = typeof parsed.href === 'string' ? parsed.href : undefined;
  const handle = typeof parsed.handle === 'string' ? parsed.handle : undefined;
  const reason = typeof parsed.unresolvedReason === 'string' ? parsed.unresolvedReason : undefined;
  if (href !== undefined && (href.length === 0 || href.length > 4096)) {
    fail(`${path}/href`, 'must contain 1-4096 UTF-16 units');
  }
  if (handle !== undefined && (handle.length === 0 || handle.length > 128)) {
    fail(`${path}/handle`, 'must contain 1-128 UTF-16 units');
  }
  if (resolvable) {
    if (handle === undefined) fail(`${path}/handle`, 'is required for a resolvable source');
    if (reason !== undefined) fail(`${path}/unresolvedReason`, 'must be omitted when resolvable');
  } else {
    if (handle !== undefined) fail(`${path}/handle`, 'must be omitted when unresolved');
    if (reason === undefined) fail(`${path}/unresolvedReason`, 'is required when unresolved');
  }
  if (kind === 'publication-resource' && href === undefined) {
    fail(`${path}/href`, 'is required for a publication resource');
  }
  if (kind === 'inline-svg' && href !== undefined) {
    fail(`${path}/href`, 'must be omitted for inline SVG');
  }
  if (kind === 'external') {
    if (href === undefined) fail(`${path}/href`, 'is required for an external source');
    if (resolvable || reason !== 'external-resource') {
      fail(path, 'external sources must be unresolved with reason external-resource');
    }
  }
}

function validateReaderImageActivationObject(
  value: unknown,
  path: string
): ReaderImageActivationEvent {
  const parsed = object(value, path);
  string(required(parsed, 'instanceId', path), `${path}/instanceId`);
  integer(required(parsed, 'generation', path), `${path}/generation`);
  integer(required(parsed, 'sequence', path), `${path}/sequence`);
  enumValue(
    required(parsed, 'platform', path),
    new Set<string>(NATIVE_PLATFORMS),
    `${path}/platform`
  );
  optionalString(parsed, 'alt', path);
  optionalString(parsed, 'caption', path);
  for (const key of ['alt', 'caption'] as const) {
    if (typeof parsed[key] === 'string' && parsed[key]!.length > 4096) {
      fail(`${path}/${key}`, 'must contain at most 4096 UTF-16 units');
    }
  }
  validateLocatorObject(required(parsed, 'locator', path), `${path}/locator`);
  validateReaderImageSourceObject(required(parsed, 'source', path), `${path}/source`);
  const rights = object(required(parsed, 'rights', path), `${path}/rights`);
  boolean(required(rights, 'canShare', `${path}/rights`), `${path}/rights/canShare`);
  boolean(required(rights, 'canZoom', `${path}/rights`), `${path}/rights/canZoom`);
  if (Object.hasOwn(parsed, 'geometry')) {
    validateGeometryObject(parsed.geometry, `${path}/geometry`);
  }
  return parsed as unknown as ReaderImageActivationEvent;
}

export function parseReaderResolvedImageSource(value: unknown): ReaderResolvedImageSource {
  const parsed = object(value, '$');
  string(required(parsed, 'id', '$'), '$/id');
  const uri = string(required(parsed, 'uri', '$'), '$/uri');
  if (!uri.startsWith('file://')) fail('$/uri', 'must be a local file URI');
  validateImageContentType(required(parsed, 'contentType', '$'), '$/contentType');
  integer(required(parsed, 'byteLength', '$'), '$/byteLength', 1);
  return parsed as unknown as ReaderResolvedImageSource;
}

function validateReaderErrorObject(value: unknown, path: string): ReaderError {
  const parsed = object(value, path);
  enumValue(required(parsed, 'code', path), readerErrorCodes, `${path}/code`);
  enumValue(required(parsed, 'phase', path), readerErrorPhases, `${path}/phase`);
  string(required(parsed, 'message', path), `${path}/message`);
  boolean(required(parsed, 'recoverable', path), `${path}/recoverable`);
  optionalString(parsed, 'publicationUri', path);
  if (Object.hasOwn(parsed, 'nativeDetails'))
    cloneJson(parsed.nativeDetails, `${path}/nativeDetails`);
  return parsed as unknown as ReaderError;
}

export function parsePublicationSource(value: unknown): PublicationSource {
  return validatePublicationSourceObject(value, '$');
}

export function parseLocator(value: unknown): Locator {
  return validateLocatorObject(value, '$');
}

export function parseReaderGeometry(value: unknown): ReaderGeometry {
  return validateGeometryObject(value, '$');
}

export function parsePublicationSummary(value: unknown): PublicationSummary {
  return validatePublicationSummaryObject(value, '$');
}

export function parsePublicationInfo(value: unknown): PublicationInfo {
  return validatePublicationInfoObject(value, '$');
}

export function parsePublicationPositionsPage(value: unknown): PublicationPositionsPage {
  return validatePublicationPositionsPageObject(value, '$');
}

export function parseNavigationUnit(value: unknown): NavigationUnit {
  return validateNavigationUnitObject(value, '$');
}

export function parseReaderLocationEvent(value: unknown): ReaderLocationEvent {
  return validateLocationEventObject(value, '$');
}

export function parseReaderSelection(value: unknown): ReaderSelection {
  return validateSelectionObject(value, '$');
}

export function parseReaderSelectionSnapshot(value: unknown): ReaderSelectionSnapshot {
  return validateSelectionSnapshotObject(value, '$');
}

export function parseReaderSelectionChangeEvent(value: unknown): ReaderSelectionChangeEvent {
  return validateSelectionChangeEventObject(value, '$');
}

export function parseReaderSelectionActionEvent(value: unknown): ReaderSelectionActionEvent {
  return validateSelectionActionEventObject(value, '$');
}

export function parseReaderDecoration(value: unknown): ReaderDecoration {
  return validateDecorationObject(value, '$');
}

export function parseReaderDecorationActivationEvent(
  value: unknown
): ReaderDecorationActivationEvent {
  return validateDecorationActivationEventObject(value, '$');
}

export function parseFootnoteEvent(value: unknown): FootnoteEvent {
  return validateFootnoteObject(value, '$');
}

export function parseReaderLinkEvent(value: unknown): ReaderLinkEvent {
  return validateReaderLinkObject(value, '$');
}

export function parseReaderImageActivationEvent(value: unknown): ReaderImageActivationEvent {
  return validateReaderImageActivationObject(value, '$');
}

export function parseReaderError(value: unknown): ReaderError {
  return validateReaderErrorObject(value, '$');
}

export interface NativeReaderErrorInput {
  code: string;
  message: string;
  nativeDetails?: JsonValue;
  phase: string;
  publicationUri?: string;
  recoverable: boolean;
}

/** Maps native/toolkit aliases into the stable public error families. */
export function mapNativeReaderError(input: NativeReaderErrorInput): ReaderError {
  const code = readerErrorCodes.has(input.code)
    ? (input.code as ReaderError['code'])
    : input.code === 'NAVIGATOR_RUNTIME_FAILED'
      ? 'RESOURCE_LOAD_FAILED'
      : 'NATIVE_INVARIANT_VIOLATION';
  const phase = readerErrorPhases.has(input.phase)
    ? (input.phase as ReaderError['phase'])
    : 'render';
  const needsNativeIdentity = code !== input.code || phase !== input.phase;
  const nativeDetails = needsNativeIdentity
    ? {
        ...(input.nativeDetails === undefined ? {} : { details: input.nativeDetails }),
        nativeCode: input.code,
        nativePhase: input.phase,
      }
    : input.nativeDetails;

  return parseReaderError({
    code,
    message: input.message,
    ...(nativeDetails === undefined ? {} : { nativeDetails }),
    phase,
    ...(input.publicationUri === undefined ? {} : { publicationUri: input.publicationUri }),
    recoverable: input.recoverable,
  });
}

export function parseCoreRecord<T extends CoreRecordType>(
  recordType: T,
  value: unknown
): CoreRecordMap[T] {
  const parsers: { [K in CoreRecordType]: (input: unknown) => CoreRecordMap[K] } = {
    publicationSource: parsePublicationSource,
    locator: parseLocator,
    readerGeometry: parseReaderGeometry,
    publicationSummary: parsePublicationSummary,
    navigationUnit: parseNavigationUnit,
    readerLocationEvent: parseReaderLocationEvent,
    readerSelection: parseReaderSelection,
    readerSelectionChangeEvent: parseReaderSelectionChangeEvent,
    readerSelectionActionEvent: parseReaderSelectionActionEvent,
    readerDecoration: parseReaderDecoration,
    readerDecorationActivationEvent: parseReaderDecorationActivationEvent,
    footnoteEvent: parseFootnoteEvent,
    readerLinkEvent: parseReaderLinkEvent,
    readerImageActivationEvent: parseReaderImageActivationEvent,
    readerError: parseReaderError,
  };
  return parsers[recordType](value);
}

/** Returns a detached JSON value after applying the same stable record validation. */
export function serializeCoreRecord<T extends CoreRecordType>(
  recordType: T,
  value: CoreRecordMap[T]
): JsonValue {
  return parseCoreRecord(recordType, value) as unknown as JsonValue;
}

/** Error subclass for rejected native commands while keeping a JSON record boundary. */
export class NativeEpubKitError extends Error implements ReaderError {
  readonly code: ReaderError['code'];
  readonly nativeDetails?: JsonValue;
  readonly phase: ReaderError['phase'];
  readonly publicationUri?: string;
  readonly recoverable: boolean;

  constructor(record: ReaderError) {
    const validated = parseReaderError(record);
    super(validated.message);
    this.name = 'NativeEpubKitError';
    this.code = validated.code;
    this.phase = validated.phase;
    this.recoverable = validated.recoverable;
    if (validated.publicationUri !== undefined) this.publicationUri = validated.publicationUri;
    if (validated.nativeDetails !== undefined) this.nativeDetails = validated.nativeDetails;
  }

  toJSON(): ReaderError {
    return parseReaderError({
      code: this.code,
      message: this.message,
      ...(this.nativeDetails === undefined ? {} : { nativeDetails: this.nativeDetails }),
      phase: this.phase,
      ...(this.publicationUri === undefined ? {} : { publicationUri: this.publicationUri }),
      recoverable: this.recoverable,
    });
  }
}
