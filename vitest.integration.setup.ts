import dotenv from "dotenv";
import { assertSafeTestDatabaseUrl, getConfiguredTestDatabaseUrl } from "./src/db/test-guard";

Object.assign(process.env, { NODE_ENV: "test" });
dotenv.config({ path: ".env.test" });
assertSafeTestDatabaseUrl(getConfiguredTestDatabaseUrl());
