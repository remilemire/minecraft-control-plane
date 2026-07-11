// apps/backend/src/middleware/error-handler.ts
import { translateError } from "@/errors/translator.js";
// Express only treats a middleware as an error handler when it declares
// exactly four parameters, so `_next` must stay even though it is unused.
export const errorHandler = (error, _req, res, _next) => {
    const response = translateError(error);
    res.status(response.status).json(response.body);
};
//# sourceMappingURL=error-handler.js.map