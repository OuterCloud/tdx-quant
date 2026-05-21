import createClient from "openapi-fetch";

export const api = createClient({
  baseUrl: "/api",
});
