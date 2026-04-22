const { MongoClient } = require('mongodb');

async function dropIndex() {
  const client = new MongoClient('mongodb://172.16.3.20:27017');
  try {
    await client.connect();
    const db = client.db('core_aiwm');
    const collection = db.collection('models');
    
    console.log('Dropping modelId_1 index...');
    await collection.dropIndex('modelId_1');
    console.log('Successfully dropped modelId_1 index');
    
  } catch (err) {
    console.log('Error:', err.message);
  } finally {
    await client.close();
  }
}

dropIndex();
