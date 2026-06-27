const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey, {
  realtime: {
    transport: WebSocket
  }
});

module.exports = { supabase };