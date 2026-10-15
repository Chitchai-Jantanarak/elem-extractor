import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Page-script tests opt into jsdom per file with a @vitest-environment comment.
    environment: 'node'
  }
})
