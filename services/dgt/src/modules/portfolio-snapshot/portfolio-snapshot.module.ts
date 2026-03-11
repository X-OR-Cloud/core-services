import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PortfolioSnapshot, PortfolioSnapshotSchema } from './portfolio-snapshot.schema';
import { PortfolioSnapshotService } from './portfolio-snapshot.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PortfolioSnapshot.name, schema: PortfolioSnapshotSchema },
    ]),
  ],
  providers: [PortfolioSnapshotService],
  exports: [
    PortfolioSnapshotService,
    MongooseModule.forFeature([
      { name: PortfolioSnapshot.name, schema: PortfolioSnapshotSchema },
    ]),
  ],
})
export class PortfolioSnapshotModule {}
