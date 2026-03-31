#!/usr/bin/env node

import { program } from './index.js'

program.parseAsync().catch((err) => {
  console.error(err)
  process.exit(1)
})
