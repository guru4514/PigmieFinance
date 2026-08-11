import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../../prisma/tenant-prisma.service';
import { createClient } from '@supabase/supabase-js';
import { ConfigService } from '@nestjs/config';
import { RequestUploadUrlDto, RegisterDocumentDto } from './dto/document.dto';

@Injectable()
export class DocumentsService {
  private supabaseAdmin: ReturnType<typeof createClient>;

  constructor(
    private tenantPrisma: TenantPrismaService,
    private configService: ConfigService,
  ) {
    this.supabaseAdmin = createClient(
      this.configService.get<string>('SUPABASE_URL')!,
      this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY')!,
    );
  }

  async getUploadUrl(organizationId: string, staffId: string, dto: RequestUploadUrlDto) {
    const bucket = dto.relatedEntityType === 'customer' ? 'kyc-documents' : 'collection-photos';
    const filePath = `${organizationId}/${dto.relatedEntityType}/${dto.relatedEntityId}/${Date.now()}-${dto.fileName}`;

    const { data, error } = await this.supabaseAdmin.storage
      .from(bucket)
      .createSignedUploadUrl(filePath);

    if (error) {
      throw new Error(`Failed to create upload URL: ${error.message}`);
    }

    return {
      signedUrl: data.signedUrl,
      path: filePath,
      token: data.token,
      bucket,
    };
  }

  async registerDocument(organizationId: string, staffId: string, dto: RegisterDocumentDto) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      return tx.document.create({
        data: {
          organizationId,
          relatedEntityType: dto.relatedEntityType as any,
          relatedEntityId: dto.relatedEntityId,
          documentType: dto.documentType,
          filePath: dto.filePath,
          mimeType: dto.mimeType,
          fileSizeBytes: dto.fileSizeBytes ? BigInt(dto.fileSizeBytes) : null,
          uploadedById: staffId,
        },
      });
    });
  }

  async getSignedDownloadUrl(organizationId: string, documentId: string) {
    const document = await this.tenantPrisma.run(organizationId, async (tx) => {
      return tx.document.findFirst({
        where: { id: documentId, organizationId },
      });
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    const bucket = document.relatedEntityType === 'customer' ? 'kyc-documents' : 'collection-photos';
    const { data, error } = await this.supabaseAdmin.storage
      .from(bucket)
      .createSignedUrl(document.filePath, 300); // 5-minute signed URL

    if (error) {
      throw new Error(`Failed to create download URL: ${error.message}`);
    }

    return { signedUrl: data.signedUrl, document };
  }

  async findByEntity(organizationId: string, entityType: string, entityId: string) {
    return this.tenantPrisma.run(organizationId, async (tx) => {
      return tx.document.findMany({
        where: {
          organizationId,
          relatedEntityType: entityType as any,
          relatedEntityId: entityId,
        },
        orderBy: { createdAt: 'desc' },
        include: {
          uploadedBy: { select: { id: true, fullName: true } },
        },
      });
    });
  }
}
