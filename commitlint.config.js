export default {
  extends: ["@commitlint/config-conventional"],
  defaultIgnores: true,
  rules: {
    "body-max-line-length": [0, "always"],
  },
};
