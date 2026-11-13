import { OneBotAction } from '@/napcat-onebot/action/OneBotAction';
import { ActionName, BaseCheckResult } from '@/napcat-onebot/action/router';
import { Type } from '@sinclair/typebox';
import { PROJECT_NAME, PROJECT_REPOSITORY } from '@/napcat-common/src/project';

const packetHelp = `${PROJECT_NAME} 为冻结版，请参照发行包内文档和启动日志检查 packetBackend 状态与 QQ 版本兼容性。${PROJECT_REPOSITORY ? `项目文档：${PROJECT_REPOSITORY}#readme。` : '仓库地址未配置。'}`;

export abstract class GetPacketStatusDepends<PT, RT> extends OneBotAction<PT, RT> {
  protected override async check (payload: PT): Promise<BaseCheckResult> {
    const schemaResult = await super.check(payload);
    if (!schemaResult.valid) return schemaResult;
    if (!this.core.apis.PacketApi.packetStatus) {
      return {
        valid: false,
        message: 'packetBackend 不可用。' + packetHelp +
          '错误堆栈信息：' + this.core.apis.PacketApi.clientLogStack,
      };
    }
    return { valid: true };
  }
}

export abstract class PacketSendAvailableDepends<PT, RT> extends OneBotAction<PT, RT> {
  protected override async check (payload: PT): Promise<BaseCheckResult> {
    const schemaResult = await super.check(payload);
    if (!schemaResult.valid) return schemaResult;
    if (!this.core.apis.PacketApi.available) {
      return {
        valid: false,
        message: 'packetBackend 发包能力不可用。' + packetHelp +
          '错误堆栈信息：' + this.core.apis.PacketApi.clientLogStack,
      };
    }
    return { valid: true };
  }
}

export class GetPacketStatus extends GetPacketStatusDepends<void, void> {
  override actionName = ActionName.GetPacketStatus;
  override payloadSchema = Type.Object({});
  override returnSchema = Type.Null();
  override actionSummary = '获取Packet状态';
  override actionDescription = '获取底层Packet服务的运行状态';
  override actionTags = ['系统接口'];
  override payloadExample = {};
  override returnExample = null;

  async _handle () {

  }
}
