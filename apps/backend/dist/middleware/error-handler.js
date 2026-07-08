// apps/backend/src/middleware/error-handler.ts
import { translateError } from "@/errors/index.js";
export const errorHandler = (error, _req, res) => {
    const response = translateError(error).toResponse();
    res.status(response.status).json(response.body);
};
//# sourceMappingURL=error-handler.js.map