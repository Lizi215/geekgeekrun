import { DataSource, MigrationInterface, QueryRunner, TableColumn } from "typeorm";
import { VBossLibrary } from "../entity/VBossLibrary";
import { VChatStartupLog } from "../entity/VChatStartupLog";
import { VCompanyLibrary } from "../entity/VCompanyLibrary";
import { VJobLibrary } from "../entity/VJobLibrary";
import { VMarkAsNotSuitLog } from "../entity/VMarkAsNotSuitLog";

const ViewEntities = [
  VBossLibrary,
  VChatStartupLog,
  VCompanyLibrary,
  VJobLibrary,
  VMarkAsNotSuitLog,
]

export class AddSalaryDescForJobInfo1769400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const dataSource = queryRunner.connection as DataSource;

    // 视图依赖 job_info 的列，加列前先全部删除，加列后重建
    for (const EntityDefinition of ViewEntities) {
      const viewMetadata = dataSource.getMetadata(EntityDefinition);
      await queryRunner.query(`DROP VIEW IF EXISTS "${viewMetadata.tableName}"`);
    }

    if (await queryRunner.hasTable("job_info")) {
      if (!await queryRunner.hasColumn("job_info", "salaryDesc")) {
        await queryRunner.addColumn(
          "job_info",
          new TableColumn({
            name: "salaryDesc",
            type: "varchar",
            isNullable: true,
          })
        );
      }

      // 从变更日志回填历史数据：取每个 job 最新一条含 salaryDesc 的记录
      if (await queryRunner.hasTable("job_info_change_log")) {
        await queryRunner.query(`
          UPDATE job_info
          SET salaryDesc = (
            SELECT json_extract(log.dataAsJson, '$.salaryDesc')
            FROM job_info_change_log log
            WHERE log.encryptJobId = job_info.encryptJobId
              AND log.dataAsJson LIKE '%salaryDesc%'
              AND json_extract(log.dataAsJson, '$.salaryDesc') IS NOT NULL
            ORDER BY log.updateTime DESC
            LIMIT 1
          )
          WHERE salaryDesc IS NULL
        `);
      }
    }

    for (const EntityDefinition of ViewEntities) {
      const viewMetadata = dataSource.getMetadata(EntityDefinition);
      let expression = viewMetadata.expression;
      if (typeof expression === 'function') {
        expression = expression(dataSource).getQuery();
      }
      await queryRunner.query(`CREATE VIEW "${viewMetadata.tableName}" AS ${expression}`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {}
}
