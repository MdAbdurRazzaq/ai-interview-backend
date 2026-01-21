import { Request, Response, NextFunction } from 'express';

export function requireRole(...allowedRoles: string[]) {
  return (
    req: Request & { user?: { role?: string } },
    res: Response,
    next: NextFunction
  ) => {
    const role = req.user?.role;

    if (!role) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    if (!allowedRoles.includes(role)) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    next();
  };
}

// import { Request, Response, NextFunction } from 'express';

// export function requireRole(...allowedRoles: string[]) {
//   return (
//     req: Request & { user?: { role?: string } },
//     res: Response,
//     next: NextFunction
//   ) => {
//     console.log('🧠 ROLE CHECK');
//     console.log('Allowed roles:', allowedRoles);
//     console.log('User object:', req.user);

//     const role = req.user?.role;

//     if (!role) {
//       console.log('❌ No role found on req.user');
//       return res.status(401).json({ message: 'Unauthorized' });
//     }

//     if (!allowedRoles.includes(role)) {
//       console.log(`❌ Role "${role}" not allowed`);
//       return res.status(403).json({ message: 'Forbidden' });
//     }

//     console.log('✅ Role allowed');
//     next();
//   };
// }
