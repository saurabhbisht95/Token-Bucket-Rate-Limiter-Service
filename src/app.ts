import Fastify from "fastify";
import { healthRoutes } from "./modules/health/health.routes.js";
// import { adminRoutes } from "./modules/admin/admin.routes.js";
// import { limiterRoutes } from "./modules/limiter/limiter.routes.js";

export function buildApp() {
    const app = Fastify({
        logger: true,
    });

    app.register(healthRoutes);
    // app.register(adminRoutes, { prefix: "/v1/admin"});
    // app.register(limiterRoutes, { prefix: "/v1"});

    return app;
}

