import { Request, Response } from 'express';
import prisma from '../../database/prisma';

export class InterviewController {
  static async createTemplate(req: Request, res: Response) {
    try {
      const { title, description, questionIds } = req.body;

      console.log('[CREATE TEMPLATE] Received payload:', { title, description, questionIds });

      if (!title) {
        return res.status(400).json({ message: 'Title is required' });
      }

      if (!req.user) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      const organizationId = req.user.organizationId;
      console.log('[CREATE TEMPLATE] OrganizationId:', organizationId);

      // Verify organization exists
      const org = await prisma.organization.findUnique({
        where: { id: organizationId },
      });

      if (!org) {
        console.error('[CREATE TEMPLATE] Organization not found:', organizationId);
        return res.status(400).json({ message: 'Organization not found' });
      }
      console.log('[CREATE TEMPLATE] ✓ Organization verified');

      // If questions provided, copy from QuestionBank to InterviewQuestion
      let interviewQuestions: any[] = [];
      if (questionIds && Array.isArray(questionIds) && questionIds.length > 0) {
        console.log('[CREATE TEMPLATE] Fetching questions from QuestionBank:', questionIds);
        
        const qbQuestions = await prisma.questionBank.findMany({
          where: {
            id: { in: questionIds },
            organizationId, // Must belong to same org
            isActive: true,
          },
        });

        if (qbQuestions.length !== questionIds.length) {
          console.error('[CREATE TEMPLATE] Some questions not found or inactive');
          return res.status(400).json({ 
            message: `Only ${qbQuestions.length}/${questionIds.length} questions found and active` 
          });
        }
        console.log('[CREATE TEMPLATE] ✓ All questions found and active');

        // Map QuestionBank questions to InterviewQuestion data
        interviewQuestions = qbQuestions.map((q, index) => ({
          text: q.questionText, // Copy text from QuestionBank
          orderIndex: index,
        }));
      }

      console.log('[CREATE TEMPLATE] About to create template with questions:', interviewQuestions.length);

      // Create template with questions in a transaction
      const template = await prisma.interviewTemplate.create({
        data: {
          title,
          description,
          createdBy: req.user.userId,
          organizationId,
          questions: {
            create: interviewQuestions,
          },
        },
        include: {
          questions: {
            orderBy: { orderIndex: 'asc' },
          },
        },
      });

      console.log('[CREATE TEMPLATE] ✓ Template created successfully:', template.id);
      return res.status(201).json(template);
    } catch (error: any) {
      console.error('[CREATE TEMPLATE] ❌ ERROR:', error);
      console.error('  Code:', error.code);
      console.error('  Message:', error.message);
      console.error('  Meta:', error.meta);
      
      if (error.code === 'P2003') {
        return res.status(400).json({ 
          message: 'Foreign key constraint violation - organization may not exist',
          code: error.code 
        });
      }
      
      return res.status(500).json({ 
        message: 'Failed to create template',
        error: error.message 
      });
    }
  }

  static async listTemplates(req: Request, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      // Check if client wants to include archived templates
      const includeArchived = req.query.includeArchived === 'true';
      console.log('[LIST TEMPLATES] includeArchived:', includeArchived);

      const where: any = {
        organizationId: req.user.organizationId, // ✅ SCOPED TO ORG
      };

      // Only filter by status if not including archived
      if (!includeArchived) {
        where.status = 'ACTIVE';
      }

      const templates = await prisma.interviewTemplate.findMany({
        where,
        include: {
          _count: {
            select: { questions: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      console.log('[LIST TEMPLATES] Returning', templates.length, 'templates');
      return res.json(templates);
    } catch (error) {
      console.error('LIST TEMPLATE ERROR:', error);
      return res.status(500).json({ message: 'Failed to fetch templates' });
    }
  }

  static async archiveTemplate(req: Request, res: Response) {
    try {
      const { id } = req.params;

      if (!req.user) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      if (!id) {
        return res.status(400).json({ message: 'Template ID is required' });
      }

      // ✅ Verify template belongs to the user's organization
      const template = await prisma.interviewTemplate.findUnique({
        where: { id },
      });

      if (!template) {
        return res.status(404).json({ message: 'Template not found' });
      }

      if (template.organizationId !== req.user.organizationId) {
        return res.status(403).json({ message: 'Forbidden: Template does not belong to your organization' });
      }

      // ✅ Archive the template (just update status)
      const archived = await prisma.interviewTemplate.update({
        where: { id },
        data: { status: 'ARCHIVED' },
        include: {
          questions: {
            orderBy: { orderIndex: 'asc' },
          },
        },
      });

      return res.status(200).json({ message: 'Template archived successfully', template: archived });
    } catch (error) {
      console.error('ARCHIVE TEMPLATE ERROR:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      return res.status(500).json({
        message: 'Failed to archive template',
        error: errorMessage,
      });
    }
  }

  static async restoreTemplate(req: Request, res: Response) {
    try {
      const { id } = req.params;

      if (!req.user) {
        return res.status(401).json({ message: 'Unauthorized' });
      }

      if (!id) {
        return res.status(400).json({ message: 'Template ID is required' });
      }

      // ✅ Verify template belongs to the user's organization
      const template = await prisma.interviewTemplate.findUnique({
        where: { id },
      });

      if (!template) {
        return res.status(404).json({ message: 'Template not found' });
      }

      if (template.organizationId !== req.user.organizationId) {
        return res.status(403).json({ message: 'Forbidden: Template does not belong to your organization' });
      }

      // ✅ Restore the template (update status back to ACTIVE)
      const restored = await prisma.interviewTemplate.update({
        where: { id },
        data: { status: 'ACTIVE' },
        include: {
          questions: {
            orderBy: { orderIndex: 'asc' },
          },
        },
      });

      return res.status(200).json({ message: 'Template restored successfully', template: restored });
    } catch (error) {
      console.error('RESTORE TEMPLATE ERROR:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      return res.status(500).json({
        message: 'Failed to restore template',
        error: errorMessage,
      });
    }
  }
}
