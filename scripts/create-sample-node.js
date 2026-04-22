const { MongoClient, ObjectId } = require('mongodb');

async function createSampleNode() {
  const client = new MongoClient('mongodb://172.16.3.20:27017');

  try {
    await client.connect();
    console.log('Connected to MongoDB');

    const db = client.db('core_aiwm');
    const nodesCollection = db.collection('nodes');

    // Check if sample node already exists
    const existingNode = await nodesCollection.findOne({ nodeId: 'node-gpu-001' });

    if (existingNode) {
      console.log('Sample node already exists with ID:', existingNode._id);
      console.log('Node details:', JSON.stringify(existingNode, null, 2));
      return existingNode._id;
    }

    // Create sample node with online status
    const sampleNode = {
      nodeId: 'node-gpu-001',
      name: 'GPU Node 1',
      role: ['worker'],
      status: 'online',
      isLocal: true,
      websocketConnected: true,
      lastHeartbeat: new Date(),
      gpuDevices: [
        {
          deviceId: '0',
          model: 'NVIDIA Tesla P40',
          memoryTotal: 24576, // 24GB in MB
          memoryFree: 20000,
          utilization: 10,
          temperature: 45
        }
      ],
      cpuCores: 16,
      ramTotal: 65536, // 64GB in MB
      ramFree: 40000,
      owner: {
        orgId: new ObjectId('691eb9e6517f917943ae1f9d'),
        groupId: '',
        userId: new ObjectId('691eba08517f917943ae1fa1'),
        agentId: '',
        appId: ''
      },
      createdBy: new ObjectId('691eba08517f917943ae1fa1'),
      updatedBy: new ObjectId('691eba08517f917943ae1fa1'),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await nodesCollection.insertOne(sampleNode);
    console.log('Successfully created sample node with ID:', result.insertedId);
    console.log('Node details:', JSON.stringify(sampleNode, null, 2));

    return result.insertedId;
  } catch (error) {
    console.error('Error creating sample node:', error.message);
    throw error;
  } finally {
    await client.close();
  }
}

createSampleNode();
