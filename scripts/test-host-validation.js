#!/usr/bin/env node
/**
 * Quick test script for host validation logic
 */

// Simulate the logic from bootstrap-mcp.ts
const allowedHosts = process.env.MCP_ALLOWED_HOSTS
  ? process.env.MCP_ALLOWED_HOSTS.split(',')
  : ['localhost', '127.0.0.1', '[::1]', 'test.local'];

console.log('🔍 Testing Host Validation Logic\n');
console.log('Environment variable MCP_ALLOWED_HOSTS:', process.env.MCP_ALLOWED_HOSTS || '(not set)');
console.log('Allowed hosts:', allowedHosts);
console.log('');

// Test cases
const testHosts = [
  'localhost',
  '127.0.0.1',
  '[::1]',
  'test.local',
  'api.x-or.cloud',
  'example.com'
];

console.log('Test Results:');
console.log('-'.repeat(50));

testHosts.forEach(host => {
  const isAllowed = allowedHosts.includes(host);
  const status = isAllowed ? '✅ ALLOWED' : '❌ BLOCKED';
  console.log(`${status}: ${host}`);
});

console.log('-'.repeat(50));
console.log('\n💡 To allow specific hosts:');
console.log('   export MCP_ALLOWED_HOSTS="localhost,127.0.0.1,test.local,api.x-or.cloud"');
console.log('\n💡 To disable validation (dev only):');
console.log('   export ALLOW_ALL_HOSTS=true');
