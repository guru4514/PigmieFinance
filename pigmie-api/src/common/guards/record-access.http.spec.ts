jest.mock('../utils/jwks-verifier.util', () => ({
  verifySupabaseToken: jest.fn(),
}));
jest.mock('../../modules/auth/auth.service', () => ({
  AuthService: class AuthService {},
}));
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import request from 'supertest';
import type { Server } from 'node:http';
import { verifySupabaseToken } from '../utils/jwks-verifier.util';
import { LoansController } from '../../modules/loans/loans.controller';
import { LoansService } from '../../modules/loans/loans.service';
import { PdfService } from '../../modules/loans/pdf.service';
import { CustomersController } from '../../modules/customers/customers.controller';
import { CustomersService } from '../../modules/customers/customers.service';
import { CustomerPdfService } from '../../modules/customers/customer-pdf.service';
import { CollectionsController } from '../../modules/collections/collections.controller';
import { CollectionsService } from '../../modules/collections/collections.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { StaffUser } from '../types/request-user.type';
import { AuthController } from '../../modules/auth/auth.controller';
import { AuthService } from '../../modules/auth/auth.service';
import { noStoreMiddleware } from '../middleware/no-store.middleware';

describe('HTTP record access (mocked database)', () => {
  const id = '00000000-0000-4000-8000-000000000001';
  let app: INestApplication;
  let httpServer: Server;
  let actor: StaffUser;
  const scope = jest.fn();
  const findOne = jest.fn();
  const recordCollection = jest.fn();
  const syncCollections = jest.fn();
  const findLoans = jest.fn();
  const generateLoanStatement = jest.fn();
  const generatePassbook = jest.fn();
  const generateReceipt = jest.fn();
  const getDueToday = jest.fn();
  const approve = jest.fn();
  beforeAll(async () => {
    const tx = {
      loan: { findFirst: scope },
      customer: { findFirst: scope },
      collection: { findFirst: scope },
    } as unknown as Prisma.TransactionClient;
    const module = await Test.createTestingModule({
      controllers: [
        LoansController,
        CustomersController,
        CollectionsController,
        AuthController,
      ],
      providers: [
        {
          provide: PrismaService,
          useValue: {
            $queryRaw: jest
              .fn()
              .mockResolvedValue([{ active: true, hasVerifiedFactor: true }]),
            staff: { findUnique: () => ({ ...actor, isActive: true }) },
          },
        },
        {
          provide: TenantPrismaService,
          useValue: {
            run: <T>(
              _org: string,
              action: (client: Prisma.TransactionClient) => Promise<T>,
            ) => action(tx),
          },
        },
        { provide: LoansService, useValue: { findOne, approve } },
        {
          provide: AuthService,
          useValue: {
            getMe: () => ({ userType: 'staff', id: actor.id }),
            logLoginEvent: () => ({ success: true }),
          },
        },
        { provide: PdfService, useValue: { generateLoanStatement } },
        { provide: CustomersService, useValue: { findLoans } },
        { provide: CustomerPdfService, useValue: { generatePassbook } },
        {
          provide: CollectionsService,
          useValue: {
            recordCollection,
            syncCollections,
            generateReceipt,
            getDueToday,
          },
        },
      ],
    }).compile();
    app = module.createNestApplication();
    app.use(noStoreMiddleware);
    await app.init();
    httpServer = app.getHttpServer() as Server;
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => {
    jest.clearAllMocks();
    actor = {
      type: 'staff',
      id: 'agent',
      organizationId: 'org',
      branchId: 'branch',
      role: 'agent',
    };
    jest.mocked(verifySupabaseToken).mockResolvedValue({
      sub: '00000000-0000-4000-8000-000000000098',
      session_id: '00000000-0000-4000-8000-000000000099',
      role: 'authenticated',
      aal: 'aal2',
    });
    scope.mockResolvedValue(null);
    findOne.mockResolvedValue({ id });
    recordCollection.mockResolvedValue({ status: 'created' });
    getDueToday.mockResolvedValue([]);
  });
  it.each([
    `/loans/${id}`,
    `/loans/${id}/schedule`,
    `/loans/${id}/statement`,
    `/customers/${id}/loans`,
    `/customers/${id}/passbook`,
    `/collections/${id}/receipt`,
  ])('blocks an inaccessible record at %s before the handler', async (url) => {
    await request(httpServer)
      .get(url)
      .set('Authorization', 'Bearer synthetic')
      .expect(404);
    expect(findOne).not.toHaveBeenCalled();
    expect(findLoans).not.toHaveBeenCalled();
    expect(generateLoanStatement).not.toHaveBeenCalled();
    expect(generatePassbook).not.toHaveBeenCalled();
    expect(generateReceipt).not.toHaveBeenCalled();
  });
  it('allows profile bootstrap but rejects direct first-factor staff API access and forged MFA headers', async () => {
    jest.mocked(verifySupabaseToken).mockResolvedValue({
      sub: '00000000-0000-4000-8000-000000000098',
      session_id: '00000000-0000-4000-8000-000000000099',
      role: 'authenticated',
      aal: 'aal1',
    });
    scope.mockResolvedValue({ id });
    await request(httpServer)
      .get('/auth/me')
      .set('Authorization', 'Bearer synthetic-token')
      .expect(200);
    await request(httpServer)
      .get(`/loans/${id}?aal=aal2`)
      .set('Authorization', 'Bearer synthetic-token')
      .set('X-MFA-Verified', 'true')
      .expect(403);
    expect(findOne).not.toHaveBeenCalled();
  });
  it.each(['/auth/2fa/setup', '/auth/2fa/enable', '/auth/2fa/verify'])(
    'retires the custom factor flow at %s',
    async (url) => {
      await request(httpServer)
        .post(url)
        .set('Authorization', 'Bearer synthetic-token')
        .send({ code: '123456' })
        .expect(410);
    },
  );
  it('prevents browser/shared caches from retaining authenticated data or denied responses', async () => {
    const profile = await request(httpServer)
      .get('/auth/me')
      .set('Authorization', 'Bearer synthetic-token')
      .expect(200);
    expect(profile.headers['cache-control']).toBe('no-store, private');
    jest.mocked(verifySupabaseToken).mockResolvedValue({
      sub: '00000000-0000-4000-8000-000000000098',
      session_id: '00000000-0000-4000-8000-000000000099',
      role: 'authenticated',
      aal: 'aal1',
    });
    const denied = await request(httpServer)
      .get(`/loans/${id}`)
      .set('Authorization', 'Bearer synthetic-token')
      .expect(403);
    expect(denied.headers['cache-control']).toBe('no-store, private');
  });
  it('preserves an assigned agent’s legitimate detail access', async () => {
    scope.mockResolvedValue({ id });
    await request(httpServer)
      .get(`/loans/${id}`)
      .set('Authorization', 'Bearer synthetic')
      .expect(200, { id });
    expect(findOne).toHaveBeenCalledWith('org', id);
  });
  it('blocks collection recording and mixed-access batch sync before any payment is posted', async () => {
    await request(httpServer)
      .post('/collections')
      .set('Authorization', 'Bearer synthetic')
      .send({ loanId: id })
      .expect(404);
    scope.mockResolvedValueOnce({ id }).mockResolvedValueOnce(null);
    await request(httpServer)
      .post('/collections/sync')
      .set('Authorization', 'Bearer synthetic')
      .send({
        collections: [
          { loanId: id },
          { loanId: '00000000-0000-4000-8000-000000000002' },
        ],
      })
      .expect(404);
    expect(recordCollection).not.toHaveBeenCalled();
    expect(syncCollections).not.toHaveBeenCalled();
  });
  it('allows an authorized payment submission through the same guarded path', async () => {
    scope.mockResolvedValue({ id });
    await request(httpServer)
      .post('/collections')
      .set('Authorization', 'Bearer synthetic')
      .send({ loanId: id })
      .expect(201);
    expect(recordCollection).toHaveBeenCalledWith('org', 'agent', {
      loanId: id,
    });
  });
  it('denies another branch’s administrative loan mutation', async () => {
    actor = { ...actor, role: 'branch_manager' };
    await request(httpServer)
      .post(`/loans/${id}/approve`)
      .set('Authorization', 'Bearer synthetic')
      .expect(404);
    expect(approve).not.toHaveBeenCalled();
  });
  it('does not grant accountants payment mutation rights', async () => {
    actor = { ...actor, role: 'accountant' };
    scope.mockResolvedValue({ id });
    await request(httpServer)
      .get('/collections/due-today')
      .set('Authorization', 'Bearer synthetic')
      .expect(200);
    await request(httpServer)
      .post('/collections')
      .set('Authorization', 'Bearer synthetic')
      .send({ loanId: id })
      .expect(403);
    expect(recordCollection).not.toHaveBeenCalled();
  });
  it('denies a manager without a branch on list routes', async () => {
    actor = { ...actor, role: 'branch_manager', branchId: null };
    await request(httpServer)
      .get('/collections/due-today')
      .set('Authorization', 'Bearer synthetic')
      .expect(403);
    expect(getDueToday).not.toHaveBeenCalled();
  });
});
