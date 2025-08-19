#!/bin/bash
set -e
cd client
npm install
CI=true npm test
