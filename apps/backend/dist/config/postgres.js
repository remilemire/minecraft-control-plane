// apps/backend/src/config/postgres.ts
import z from "zod";
export const postgresEnvSchema = z
    .object({
    POSTGRES_USER: z.string().min(1),
    POSTGRES_PASSWORD: z.string().min(1),
    POSTGRES_HOST: z.string().min(1),
    POSTGRES_PORT: z.coerce.number().int().positive(),
    POSTGRES_DATABASE: z.string().min(1),
})
    .transform((env) => ({
    user: env.POSTGRES_USER,
    password: env.POSTGRES_PASSWORD,
    host: env.POSTGRES_HOST,
    port: env.POSTGRES_PORT,
    database: env.POSTGRES_DATABASE,
}));
export function buildPostgresUrl(postgres) {
    const url = new URL("postgresql://localhost");
    url.hostname = postgres.host;
    url.port = postgres.port.toString();
    url.username = postgres.user;
    url.password = postgres.password;
    url.pathname = `/${postgres.database}`;
    return url.toString();
}
//# sourceMappingURL=postgres.js.map