import "fastify";

declare module "fastify" {
  interface FastifyRequest {
    networkHash?: string;
    monitoringRecorded?: boolean;
    actor?: {
      id: string;
      token: string;
      isNew: boolean;
    };
    admin?: {
      id: string;
      email: string;
      role: "moderator" | "super_admin";
      sessionId: string;
      absoluteExpiresAt: Date;
      idleExpiresAt: Date;
    };
  }
}
