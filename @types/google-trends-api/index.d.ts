// @types/google-trends-api/index.d.ts

declare module 'google-trends-api' {
  // We can define the specific functions we use for better type safety.
  // This tells TypeScript what 'interestOverTime' looks like.
  export function interestOverTime(options: {
    keyword: string;
    startTime?: Date;
    endTime?: Date;
    geo?: string;
    [key: string]: any; // Allow other options
  }): Promise<string>;

  // You can add other functions from the library here if you use them later.
  // export function relatedQueries(options: any): Promise<any>;
  // etc.
  
  // A simple fallback if you don't want to type everything:
  // const value: any;
  // export default value;
}