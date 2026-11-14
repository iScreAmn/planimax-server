export class ProjectError extends Error {
  constructor(status, message, code) {
    super(message);
    this.name = 'ProjectError';
    this.status = status;
    this.code = code;
  }
}
