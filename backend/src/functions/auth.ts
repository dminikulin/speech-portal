import { CosmosClient } from '@azure/cosmos';
import {
  app,
  HttpRequest,
  HttpResponseInit,
  InvocationContext,
} from '@azure/functions';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HAS_NUMBER = /[0-9]/;
const HAS_SPECIAL = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/;

const JWT_SECRET = process.env.JWT_SECRET || 'incrediblyintricatekey49539';
const COSMOS_CONN = process.env.CosmosDbConnectionString || '';

function getContainer() {
  if (!COSMOS_CONN) {
    throw new Error(
      'CosmosDbConnectionString environment variable is missing.',
    );
  }
  const client = new CosmosClient(COSMOS_CONN);
  return client.database('speechportal-db').container('users');
}

export async function authHandler(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const action = request.params.action;
  let body: { email?: string; password?: string } = {};

  try {
    body = (await request.json()) as { email?: string; password?: string };
  } catch {
    return {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      jsonBody: { error: 'Invalid JSON request body.' },
    };
  }

  const { email, password } = body || {};

  if (!email || !password) {
    return {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      jsonBody: { error: 'Email and password are required.' },
    };
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    const container = getContainer();

    //1. Signup action
    if (action === 'signup') {
      if (!EMAIL_REGEX.test(normalizedEmail)) {
        return {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
          jsonBody: { error: 'A valid email address is required.' },
        };
      }

      if (
        password.length < 8 ||
        !HAS_NUMBER.test(password) ||
        !HAS_SPECIAL.test(password)
      ) {
        return {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
          jsonBody: {
            error:
              'Password must be at least 8 characters long and contain at least 1 number and 1 special character.',
          },
        };
      }

      const { resources: existingUsers } = await container.items
        .query({
          query: 'SELECT * FROM c WHERE c.email = @email',
          parameters: [{ name: '@email', value: normalizedEmail }],
        })
        .fetchAll();

      if (existingUsers.length > 0) {
        return {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
          jsonBody: { error: 'User already exists with this email.' },
        };
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const newUser = {
        id: normalizedEmail,
        email: normalizedEmail,
        passwordHash,
        createdAt: new Date().toISOString(),
      };

      await container.items.create(newUser);

      const token = jwt.sign(
        { sub: newUser.id, email: newUser.email },
        JWT_SECRET,
        { expiresIn: '7d' },
      );

      return {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
        jsonBody: {
          token,
          user: { id: newUser.id, email: newUser.email },
        },
      };
    }

    // 2. Login Action
    if (action === 'login') {
      const { resources: users } = await container.items
        .query({
          query: 'SELECT * FROM c WHERE c.email = @email',
          parameters: [{ name: '@email', value: normalizedEmail }],
        })
        .fetchAll();

      const user = users[0];
      if (!user) {
        return {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
          jsonBody: { error: 'Invalid email or password.' },
        };
      }

      const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
      if (!isPasswordValid) {
        return {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
          jsonBody: { error: 'Invalid email or password.' },
        };
      }

      const token = jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, {
        expiresIn: '7d',
      });

      return {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        jsonBody: {
          token,
          user: { id: user.id, email: user.email },
        },
      };
    }

    return {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
      jsonBody: {
        error: `Action '${action}' not supported. Use 'login' or 'signup'.`,
      },
    };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Internal server error';
    context.error('Auth error:', err);
    return {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      jsonBody: { error: message },
    };
  }
}

app.http('auth', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'auth/{action}',
  handler: authHandler,
});
