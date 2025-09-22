// netlify/functions/submit-order.js
// This is a Netlify Function that handles order submissions
// You can also adapt this for Vercel, Cloudflare Workers, or any serverless platform

exports.handler = async (event, context) => {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  try {
    const orderData = JSON.parse(event.body);
    
    // Basic validation
    if (!orderData.organization || !orderData.organization.email || !orderData.orderItems || orderData.orderItems.length === 0) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({ error: 'Invalid order data' })
      };
    }

    // Trigger GitHub Action via repository dispatch
    const githubResponse = await fetch(`https://api.github.com/repos/pluricalifornia/plurinational-landreform/dispatches`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'territorial-markets-webhook'
      },
      body: JSON.stringify({
        event_type: 'new-order',
        client_payload: orderData
      })
    });

    if (!githubResponse.ok) {
      console.error('GitHub API Error:', await githubResponse.text());
      throw new Error('Failed to trigger GitHub Action');
    }

    // Also send email notification (optional)
    // You can integrate with services like SendGrid, Mailgun, etc.
    
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        success: true,
        message: 'Order submitted successfully',
        orderNumber: orderData.orderNumber
      })
    };

  } catch (error) {
    console.error('Error processing order:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message
      })
    };
  }
};
