// apps/backend/src/errors/error-messages.ts
import { ErrorStatus } from "./error-types.js";
// ================================
// -------- Error Messages --------
// ================================
export const PUBLIC_ERROR_MESSAGES = {
  [ErrorStatus.BadRequest]: "The request could not be processed.",
  [ErrorStatus.Unauthorized]: "Authentication required.",
  [ErrorStatus.Forbidden]: "You do not have permission to perform this action.",
  [ErrorStatus.NotFound]: "The requested resource could not be found.",
  [ErrorStatus.Conflict]: "There was a conflict.",
  [ErrorStatus.Unprocessable]: "There was a problem with the submission.",
  [ErrorStatus.ServerError]: "Something went wrong.",
};
// ================================
// ---- Unprocessable Messages ----
// ================================
export const UNPROCESSABLE_DETAIL_MESSAGES = {
  extraField: "This field isn't allowed.",
  missingField: "This field is required.",
  booleanType: "Enter true or false.",
  stringType: "Enter valid text.",
  integerType: "Enter a whole number.",
  decimalType: "Enter a valid number.",
  objectType: "Enter a valid object or list.",
  tooSmall: "Too small.",
  tooLarge: "Too big.",
  tooShort: "Too short.",
  tooLong: "Too long.",
  invalidOption: "Choose one of the allowed values.",
  invalidMultiple: "Enter a valid multiple.",
  invalidValue: "Invalid value.",
};
// ================================
// ------ Conflict Messages -------
// ================================
export const CONFLICT_DETAIL_MESSAGES = {
  foreignKey: "Referenced item does not exist or is in use.",
  unique: "Already exists.",
  check: "Value does not satisfy constraints.",
  integrity: "Integrity constraint violation.",
};
//# sourceMappingURL=error-messages.js.map
