const jwt = require('jsonwebtoken');

const secret = process.env.JWT_SECRET || 'r4md0m_s3cr3t';

const payload = {
  sub: '507f1f77bcf86cd799439011',  // User ID
  username: 'testuser',
  status: 'active',
};

const token = jwt.sign(payload, secret, { expiresIn: '1h' });

console.log('Generated JWT Token:');
console.log(token);
console.log('\nTest curl command:');
console.log(`curl -H "Authorization: Bearer ${token}" http://localhost:3000/auth/verify-token`);
