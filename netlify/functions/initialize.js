const axios = require('axios');
const mysql = require('mysql2/promise');

// This function is a simplified version of the logic in the old paymentStructure.php
function getInitialPaymentJourney(email, amount) {
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    return {
        payment_journey: {
            initialized_payments: [],
            successful_payment: null,
            payment_analytics: {
                total_retry_attempts: 0,
                last_updated: now,
                journey_started_at: now,
                initial_email: email,
                initial_amount: amount
            }
        }
    };
}


exports.handler = async function(event, context) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { email, amount, reference } = JSON.parse(event.body);

        if (!email || !amount || amount <= 0 || !reference) {
            return {
                statusCode: 400,
                body: JSON.stringify({ message: 'Invalid input. Email, amount, and reference are required.' })
            };
        }

        // --- Database Logic ---
        try {
            const connection = await mysql.createConnection({
                host: process.env.DB_HOST,
                user: process.env.DB_USER,
                password: process.env.DB_PASSWORD,
                database: process.env.DB_NAME,
                port: process.env.DB_PORT || 3306
            });

            const journey = getInitialPaymentJourney(email, amount);
            journey.payment_journey.initialized_payments.push({
                paystack_reference: reference,
                amount: amount,
                email: email,
                started_at: new Date().toISOString().slice(0, 19).replace('T', ' ')
            });

            const sql = `
                INSERT INTO payments (reference, amount, email, current_status, started_at, transaction_logs)
                VALUES (?, ?, ?, 'pending', NOW(), ?)
            `;

            // We use the paystack reference as the main reference for simplicity in this new version.
            await connection.execute(sql, [reference, amount, email, JSON.stringify(journey)]);
            await connection.end();

        } catch (dbError) {
            console.error('Database Error:', dbError);
            // We can still proceed with payment initialization even if DB fails.
            // In a real-world app, you might want to handle this differently.
        }
        // --- End of Database Logic ---


        const paystackSecret = process.env.PAYSTACK_SECRET;
        if (!paystackSecret) {
            return {
                statusCode: 500,
                body: JSON.stringify({ message: 'Payment service not configured.' })
            };
        }

        const amountKobo = Math.round(parseFloat(amount) * 100);

        const paystackResponse = await axios.post(
            'https://api.paystack.co/transaction/initialize',
            {
                email: email,
                amount: amountKobo,
                reference: reference,
                callback_url: process.env.APP_URL
            },
            {
                headers: {
                    Authorization: `Bearer ${paystackSecret}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        if (paystackResponse.data && paystackResponse.data.status === true) {
            return {
                statusCode: 200,
                body: JSON.stringify(paystackResponse.data.data)
            };
        } else {
            return {
                statusCode: 500,
                body: JSON.stringify({ message: paystackResponse.data.message || 'Failed to initialize payment.' })
            };
        }
    } catch (error) {
        console.error('Initialization Error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: 'An unexpected error occurred.' })
        };
    }
};
