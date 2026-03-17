/**
 * Seed Built-in Tool Sets for ToolManagement MCP
 * Run: mongosh mongodb://172.16.3.20:27017/core_aiwm scripts/seed-builtin-tools.js
 */

const ORG_ID = '691eb9e6517f917943ae1f9d';
const USER_ID = '691eb9e6517f917943ae1f9d';

print('========================================');
print('Seeding Built-in Tool Sets');
print('========================================');
print('');

const tools = [
  {
    name: 'AgentManagement',
    description: 'Manage AI agents — list, get, create assistant agents, update, delete',
    category: 'system',
  },
  {
    name: 'ToolManagement',
    description: 'Manage tool sets — list tools and discover available functions by tool set',
    category: 'system',
  },
  {
    name: 'InstructionManagement',
    description: 'Manage agent instructions (system prompts) — list, get, create, update, delete',
    category: 'system',
  },
  {
    name: 'MemoryManagement',
    description: 'Manage agent memory — search, upsert, list keys, delete memory entries',
    category: 'system',
  },
  {
    name: 'ReminderManagement',
    description: 'Manage reminders — add, list, mark done, delete reminders',
    category: 'system',
  },
  {
    name: 'DocumentManagement',
    description: 'Manage documents — create, read, update, delete, search, append, replace content',
    category: 'productivity',
  },
  {
    name: 'WorkManagement',
    description: 'Manage work items — create, schedule, assign, update status, complete, cancel',
    category: 'productivity',
  },
  {
    name: 'ProjectManagement',
    description: 'Manage projects and members — create, update, activate, hold, archive, manage members',
    category: 'productivity',
  },
  {
    name: 'UserManagement',
    description: 'List users in the organization',
    category: 'system',
  },
  {
    name: 'BrowserAutomation',
    description: 'Automate browser tasks — open tabs, navigate, screenshot, extract content, execute actions',
    category: 'productivity',
  },
];

let successCount = 0;
let skipCount = 0;
let errorCount = 0;

tools.forEach((toolData, idx) => {
  try {
    const existing = db.tools.findOne({
      'owner.orgId': ORG_ID,
      name: toolData.name,
      isDeleted: false,
    });

    if (existing) {
      print('ℹ️  [' + (idx + 1) + '/' + tools.length + '] Already exists: "' + toolData.name + '" (id: ' + existing._id + ')');
      skipCount++;
      return;
    }

    const result = db.tools.insertOne({
      name: toolData.name,
      type: 'builtin',
      description: toolData.description,
      category: toolData.category,
      status: 'active',
      scope: 'org',
      schema: { inputSchema: {}, outputSchema: {} },
      owner: { userId: USER_ID, orgId: ORG_ID },
      createdBy: USER_ID,
      updatedBy: USER_ID,
      isDeleted: false,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    if (result.acknowledged) {
      print('✅ [' + (idx + 1) + '/' + tools.length + '] Created: "' + toolData.name + '" → ' + result.insertedId);
      successCount++;
    } else {
      print('❌ [' + (idx + 1) + '/' + tools.length + '] Failed: "' + toolData.name + '"');
      errorCount++;
    }
  } catch (error) {
    print('❌ [' + (idx + 1) + '/' + tools.length + '] Error: ' + error.message);
    errorCount++;
  }
});

print('');
print('========================================');
print('Summary: ' + successCount + ' created, ' + skipCount + ' skipped, ' + errorCount + ' errors');
print('========================================');
print('');

db.tools
  .find({ 'owner.orgId': ORG_ID, type: 'builtin', isDeleted: false })
  .sort({ name: 1 })
  .forEach((t) => {
    print('  ' + t._id + '  ' + t.name);
  });
