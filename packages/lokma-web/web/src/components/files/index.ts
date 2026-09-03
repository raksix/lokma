/**
 * Files barrel — single import point for the FileBrowser pane (W3-9).
 */
export { FileBrowser } from './file-browser';
export {
  FILE_DRAG_MIME,
  FOCUS_FILES_EVENT,
  INSERT_MENTION_EVENT,
  appendMention,
  basename,
  emitInsertMention,
  filterLoaded,
  formatSize,
  gitLabel,
  joinRel,
  parentDir,
} from './files';
