// apps/backend/src/errors/error-types.ts
export var ErrorStatus;
(function (ErrorStatus) {
    ErrorStatus[ErrorStatus["BadRequest"] = 400] = "BadRequest";
    ErrorStatus[ErrorStatus["Unauthorized"] = 401] = "Unauthorized";
    ErrorStatus[ErrorStatus["Forbidden"] = 403] = "Forbidden";
    ErrorStatus[ErrorStatus["NotFound"] = 404] = "NotFound";
    ErrorStatus[ErrorStatus["Conflict"] = 409] = "Conflict";
    ErrorStatus[ErrorStatus["Unprocessable"] = 422] = "Unprocessable";
    ErrorStatus[ErrorStatus["ServerError"] = 500] = "ServerError";
})(ErrorStatus || (ErrorStatus = {}));
//# sourceMappingURL=error-types.js.map