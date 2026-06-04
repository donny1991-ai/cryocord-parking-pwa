import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = [
  ...nextVitals,
  {
    ignores: [
      ".next/**",
      "coverage/**",
      "node_modules/**",
      "public/swe-worker-*.js",
      "next-env.d.ts",
    ],
  },
];

export default eslintConfig;
