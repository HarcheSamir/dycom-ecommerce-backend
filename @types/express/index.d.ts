// ./@types/express/index.d.ts

declare namespace Express {
    export interface Request {
      user?: {
        userId: string;
        email: string;
        firstName: string;
        lastName: string;
        accountType: 'USER' | 'ADMIN'; // <-- THIS LINE IS THE FIX
      };
    }
  }
