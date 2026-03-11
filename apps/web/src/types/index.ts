import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name: string;
      email: string;
      role: "ADMIN" | "OPERATOR";
    };
  }

  interface User {
    role: "ADMIN" | "OPERATOR";
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: "ADMIN" | "OPERATOR";
  }
}
