const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');

// Get environment variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

// Validate environment variables
if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase environment variables!');
  console.error('SUPABASE_URL:', supabaseUrl ? 'set' : 'MISSING');
  console.error('SUPABASE_KEY:', supabaseKey ? 'set' : 'MISSING');
  process.exit(1);
}

// Create Supabase client with WebSocket transport for Node.js 20
const supabase = createClient(supabaseUrl, supabaseKey, {
  realtime: {
    transport: WebSocket
  }
});

module.exports = supabase;
