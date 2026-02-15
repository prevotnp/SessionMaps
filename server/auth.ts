import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage as dbStorage } from "./storage";
import { User as SelectUser } from "@shared/schema";
import connectPg from "connect-pg-simple";

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  console.log('comparePasswords called with supplied length:', supplied.length);
  console.log('stored password format:', stored.includes('.') ? 'correct format' : 'incorrect format');
  
  const [hashed, salt] = stored.split(".");
  console.log('salt:', salt);
  console.log('hashed length:', hashed.length);
  
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  const result = timingSafeEqual(hashedBuf, suppliedBuf);
  console.log('password comparison result:', result);
  return result;
}

export function setupAuth(app: Express) {
  const PostgresSessionStore = connectPg(session);
  const sessionStore = new PostgresSessionStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: true,
  });

  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET || 'session-maps-secret-key',
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: {
      secure: false, // Set to true in production with HTTPS
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 1 week
    },
  };

  app.set("trust proxy", 1);
  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(
      { usernameField: 'email' },
      async (email, password, done) => {
        try {
          console.log(`Login attempt for email: ${email}`);
          const user = await dbStorage.getUserByEmail(email);
          console.log(`User found:`, user ? 'YES' : 'NO');
          if (user) {
            console.log(`User details:`, { id: user.id, email: user.email, isAdmin: user.isAdmin });
          }
          
          if (!user) {
            console.log('User not found');
            return done(null, false);
          }
          
          console.log('Comparing passwords...');
          console.log('Stored password hash:', user.password);
          const passwordMatch = await comparePasswords(password, user.password);
          console.log(`Password match:`, passwordMatch);
          
          if (!passwordMatch) {
            console.log('Password does not match');
            return done(null, false);
          }
          
          console.log('Login successful');
          return done(null, user);
        } catch (error) {
          console.error('Login error:', error);
          return done(error);
        }
      }
    ),
  );

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await dbStorage.getUser(id);
      done(null, user);
    } catch (error) {
      done(error);
    }
  });

  app.post("/api/register", async (req, res, next) => {
    try {
      const { username, password, email, fullName } = req.body;

      if (!username || !password || !email) {
        return res.status(400).json({ message: "Username, password, and email are required" });
      }

      if (password.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters" });
      }

      const existingUser = await dbStorage.getUserByUsername(username);
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }

      const existingEmail = await dbStorage.getUserByEmail(email);
      if (existingEmail) {
        return res.status(400).json({ message: "Email already registered" });
      }

      const hashedPassword = await hashPassword(password);
      const user = await dbStorage.createUser({
        username,
        password: hashedPassword,
        email,
        fullName: fullName || null,
        isAdmin: false,
        isSubscribed: false,
      });

      req.login(user, (err) => {
        if (err) return next(err);
        res.status(201).json(user);
      });
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({ message: "Registration failed" });
    }
  });

  app.post("/api/login", async (req, res, next) => {
    console.log('Login request received:', req.body);
    const { email, password } = req.body;
    
    try {
      // Direct authentication for debugging
      const user = await dbStorage.getUserByEmail(email);
      console.log('Direct user lookup:', user ? 'FOUND' : 'NOT FOUND');
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }
      
      console.log('Testing password comparison...');
      const passwordMatch = await comparePasswords(password, user.password);
      console.log('Direct password match:', passwordMatch);
      
      if (!passwordMatch) {
        return res.status(401).json({ message: "Invalid password" });
      }
      
      // Manual login without passport for now
      req.login(user, (loginErr) => {
        if (loginErr) {
          console.error('Login error:', loginErr);
          return next(loginErr);
        }
        console.log('Login successful for user:', user.email);
        res.status(200).json(user);
      });
    } catch (error) {
      console.error('Direct login error:', error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });

  app.get("/api/auth/user", (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    res.json(req.user);
  });
}