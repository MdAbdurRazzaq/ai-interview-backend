require('dotenv').config();

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function normalizeEmail(email) {
  if (typeof email !== 'string') {
    return null;
  }

  const normalized = email.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function normalizeFullName(name, fallback) {
  if (typeof name === 'string') {
    const trimmed = name.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }

  return fallback || 'Legacy Candidate';
}

function mapOrganizationMemberRole(userRole) {
  return userRole === 'REVIEWER' ? 'REVIEWER' : 'ADMIN';
}

async function backfillOrganizationMembers() {
  const users = await prisma.user.findMany({
    where: {
      organizationId: {
        not: null,
      },
    },
    select: {
      id: true,
      organizationId: true,
      role: true,
      createdAt: true,
      organization: {
        select: {
          id: true,
        },
      },
    },
  });

  let createdCount = 0;
  let skippedCount = 0;

  for (const user of users) {
    if (!user.organization || !user.organizationId) {
      skippedCount += 1;
      continue;
    }

    await prisma.organizationMember.upsert({
      where: {
        organizationId_userId: {
          organizationId: user.organizationId,
          userId: user.id,
        },
      },
      create: {
        organizationId: user.organizationId,
        userId: user.id,
        role: mapOrganizationMemberRole(user.role),
        status: 'ACTIVE',
        joinedAt: user.createdAt,
      },
      update: {},
    });

    createdCount += 1;
  }

  return {
    total: users.length,
    createdCount,
    skippedCount,
  };
}

async function backfillCandidates() {
  const sessions = await prisma.interviewSession.findMany({
    where: {
      candidateId: null,
    },
    select: {
      id: true,
      candidateName: true,
      candidateEmail: true,
      organizationId: true,
      template: {
        select: {
          organizationId: true,
        },
      },
    },
  });

  let linkedSessionCount = 0;
  let skippedSessionCount = 0;
  let createdCandidateCount = 0;

  for (const session of sessions) {
    const organizationId = session.organizationId || session.template?.organizationId || null;
    const emailNormalized = normalizeEmail(session.candidateEmail);

    if (!organizationId || !emailNormalized) {
      skippedSessionCount += 1;
      continue;
    }

    let candidate = await prisma.candidate.findUnique({
      where: {
        organizationId_emailNormalized: {
          organizationId,
          emailNormalized,
        },
      },
    });

    if (!candidate) {
      candidate = await prisma.candidate.create({
        data: {
          organizationId,
          fullName: normalizeFullName(session.candidateName, emailNormalized),
          email: session.candidateEmail.trim(),
          emailNormalized,
        },
      });
      createdCandidateCount += 1;
    }

    await prisma.interviewSession.update({
      where: {
        id: session.id,
      },
      data: {
        candidateId: candidate.id,
      },
    });
    linkedSessionCount += 1;
  }

  return {
    total: sessions.length,
    createdCandidateCount,
    linkedSessionCount,
    skippedSessionCount,
  };
}

async function main() {
  const organizationMemberResult = await backfillOrganizationMembers();
  const candidateResult = await backfillCandidates();

  console.log(JSON.stringify({
    organizationMemberResult,
    candidateResult,
  }, null, 2));
}

main()
  .catch(async (error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
