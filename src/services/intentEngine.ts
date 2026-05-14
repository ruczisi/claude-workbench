import { callLlm } from './llmService';
import type { LlmConfig } from './llmConfig';
import type { Task } from './taskManager';

export type IntentType =
  | 'create_task'
  | 'start_stage'
  | 'complete_stage'
  | 'advance_stage'
  | 'jump_stage'
  | 'search_knowledge'
  | 'ask_question'
  | 'general_chat';

export interface UserIntent {
  type: IntentType;
  confidence: number;
  params?: Record<string, string>;
  clarification?: string;
  response?: string;
}

export interface ParseContext {
  currentTask?: Task;
  currentStageId?: string;
}

const CLARIFICATION_THRESHOLD = 0.6;

function buildSystemPrompt(context: ParseContext): string {
  let prompt = `你是 Cospace 任务解析器。你的职责是将用户的自然语言输入解析为结构化的意图。

支持的动作类型：
- create_task: 创建新任务（如"帮我写个方案"）
- start_stage: 开始某个阶段（如"开始需求确认"）
- complete_stage: 完成当前阶段（如"这一阶段完成了"）
- advance_stage: 推进到下一阶段（如"下一阶段"、"继续"）
- jump_stage: 跳转到指定阶段（如"跳到框架构思"、"阶段2"）
- search_knowledge: 搜索知识库（如"搜索知识库中关于XX的内容"）
- ask_question: 需要向用户澄清（当信息不足时）
- general_chat: 一般对话（问候、闲聊等）

输出格式：严格返回 JSON，不要包含 markdown 代码块标记。
{
  "type": "<意图类型>",
  "confidence": <置信度 0-1>,
  "params": {<可选参数>},
  "clarification": "<当 confidence < 0.6 时的澄清问题>",
  "response": "<当 general_chat 时的回复内容>"
}`;

  if (context.currentTask) {
    prompt += `\n\n当前活跃任务：${context.currentTask.name}\n当前阶段：${context.currentTask.currentStageId || '无'}\n阶段列表：${context.currentTask.stages.map((s) => s.name).join(', ')}`;
  } else {
    prompt += '\n\n当前没有活跃的任务。任何阶段相关指令都应视为需要创建任务或澄清。';
  }

  return prompt;
}

export function isLlmConfigValid(config: LlmConfig): { valid: boolean; message?: string } {
  if (!config.apiKey || config.apiKey.trim() === '') {
    return { valid: false, message: '请先配置 LLM（侧边栏 → 设置）' };
  }
  if (!config.model || config.model.trim() === '') {
    return { valid: false, message: 'LLM 模型名称未配置' };
  }
  if (!config.baseUrl || config.baseUrl.trim() === '') {
    return { valid: false, message: 'LLM Base URL 未配置' };
  }
  return { valid: true };
}

/**
 * 简单关键词意图解析（LLM 未配置时的降级方案）
 */
export function parseUserIntentSimple(input: string, _context: ParseContext): UserIntent {
  const text = input.toLowerCase().trim();

  // --- Create task patterns (broad match) ---
  const taskKeywords = /(任务|方案|文档|计划|报告|材料|总结|ppt|汇报|文案|邮件|通知|合同|协议|提案|策划|分析|调研|述职|竞聘|简历|发言稿|讲话稿|新闻稿|推文|脚本|大纲|目录|表格|清单|日程|预算|报价|标书|立项|申请|审批|纪要|备忘录|指南|手册|规范|标准|流程|制度)/;
  const actionKeywords = /(创建|新建|添加|写|做|来|搞|弄|出|打|撰|编|拟|起草|整理|汇总|归纳|提炼|构思|设计|规划|安排|准备|完成|协助|帮忙|帮助|帮我|给我|请|想|要|需要|希望|能不能|可以不可以|能不能帮我|你可以|你能)/;

  // Pattern 1: explicit action + task keyword (e.g. "写一份汇报材料")
  if (actionKeywords.test(text) && taskKeywords.test(text)) {
    const name = input.trim().slice(0, 20) || '新任务';
    return { type: 'create_task', confidence: 0.75, params: { name } };
  }

  // Pattern 2: explicit creation intent
  if (/^(创建|新建|添加).*(任务|工作)/.test(text) || /^(帮我|给我|请|想|需要).*(写|做|创建|新建|出一份|出一个|搞一个|弄一个)/.test(text)) {
    const name = input.trim().slice(0, 20) || '新任务';
    return { type: 'create_task', confidence: 0.75, params: { name } };
  }

  // Pattern 3: user describes a work scenario without explicit action keyword
  // Detect by common work scenario keywords + length (descriptive sentence)
  if (text.length > 8 && /(出差|项目|客户|会议|活动|培训|调研|考察|学习|工作|业务|产品|服务|合作|签约|验收|交付|上线|发布|推广|营销|运营|管理|团队|部门|公司|领导|同事|员工|用户|市场|行业|竞争|趋势|政策|法规|标准|技术|系统|平台|工具|方法|模型|框架|体系|机制|模式|策略|战略|目标|计划|预算|成本|收益|利润|风险|问题|挑战|机会|优势|劣势|建议|意见|反馈|评价|考核|绩效|激励|晋升|招聘|面试|入职|离职|调动|借调|挂职|锻炼|培养|选拔|任命|免职|辞职|退休|休假|请假|报销|借款|还款|付款|收款|开票|报税|年检|审计|检查|整改|处罚|奖励|表彰|通报|公告|声明|函|回复|答复|解释|说明|介绍|推荐|引用|参考|借鉴|学习|模仿|创新|突破|改进|优化|提升|提高|增强|加强|完善|健全|建立|设立|组建|成立|撤销|合并|分立|改制|重组|整合|统筹|协调|配合|支持|保障|维护|保养|维修|更新|升级|改造|扩建|新建|迁建|重建)/.test(text)) {
    const name = input.trim().slice(0, 20) || '新任务';
    return { type: 'create_task', confidence: 0.65, params: { name } };
  }

  // --- Stage management patterns ---
  if (/(开始|启动).*(阶段|需求|框架|内容|审核)/.test(text) || /^开始/.test(text)) {
    return { type: 'start_stage', confidence: 0.7 };
  }

  if (/(完成|结束|搞定|做完).*(阶段|这一步|当前)/.test(text) || /^(完成|结束|搞定)$/.test(text)) {
    return { type: 'complete_stage', confidence: 0.7 };
  }

  if (/(下一|继续|推进|下一步|下一个)/.test(text)) {
    return { type: 'advance_stage', confidence: 0.7 };
  }

  const stageJumpMatch = text.match(/(跳到|跳转|切换到?|去).*(阶段?\s*\d|需求确认|框架构思|内容撰写|审核定稿)/);
  if (stageJumpMatch) {
    let stageId = '';
    if (text.includes('需求') || text.includes('阶段1') || text.includes('阶段 1')) stageId = 'stage1';
    else if (text.includes('框架') || text.includes('阶段2') || text.includes('阶段 2')) stageId = 'stage2';
    else if (text.includes('内容') || text.includes('阶段3') || text.includes('阶段 3')) stageId = 'stage3';
    else if (text.includes('审核') || text.includes('阶段4') || text.includes('阶段 4')) stageId = 'stage4';
    return { type: 'jump_stage', confidence: 0.7, params: { stageId } };
  }

  // Search knowledge patterns
  if (/(搜索|查找|查询|知识库).*/.test(text)) {
    return { type: 'search_knowledge', confidence: 0.7 };
  }

  // Greeting patterns
  if (/^(你好|您好|hello|hi|hey|在吗|在嘛)/.test(text)) {
    return { type: 'general_chat', confidence: 0.9, response: '你好！有什么我可以帮你的吗？' };
  }

  // Default fallback — treat unclear input as task creation when it looks like a work description
  if (text.length > 5 && !/[?？]$/.test(text)) {
    const name = input.trim().slice(0, 20) || '新任务';
    return { type: 'create_task', confidence: 0.5, params: { name } };
  }

  return {
    type: 'ask_question',
    confidence: 0.5,
    clarification: '我没有完全理解你的意思。你可以说"创建任务"、"开始阶段"、"下一阶段"等指令，或者直接描述你要做的工作。',
  };
}

/**
 * 解析用户输入为结构化意图
 */
export async function parseUserIntent(
  input: string,
  context: ParseContext,
  config: LlmConfig
): Promise<UserIntent> {
  // Pre-check LLM config
  const configCheck = isLlmConfigValid(config);
  if (!configCheck.valid) {
    return {
      type: 'general_chat',
      confidence: 0,
      response: configCheck.message,
    };
  }

  try {
    const result = await callLlm(config, {
      messages: [
        { role: 'system', content: buildSystemPrompt(context) },
        { role: 'user', content: input },
      ],
      temperature: 0.1,
      maxTokens: 500,
    });

    const parsed = parseLlmResponse(result.content);
    return postProcessIntent(parsed, context);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
      return {
        type: 'general_chat',
        confidence: 0,
        response: 'LLM API 认证失败，请检查 API Key 是否正确配置（侧边栏 → 设置）。',
      };
    }
    if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
      return {
        type: 'general_chat',
        confidence: 0,
        response: 'LLM API 请求过于频繁，请稍后再试。',
      };
    }
    return {
      type: 'general_chat',
      confidence: 0,
      response: `抱歉，解析请求时出了点问题：${errorMessage}`,
    };
  }
}

function parseLlmResponse(content: string): UserIntent {
  try {
    const cleaned = content.trim();
    const jsonStr = cleaned.startsWith('```')
      ? cleaned.replace(/```json\n?/, '').replace(/```$/, '').trim()
      : cleaned;

    const data = JSON.parse(jsonStr);

    return {
      type: validateIntentType(data.type),
      confidence: typeof data.confidence === 'number' ? data.confidence : 0.5,
      params: data.params && typeof data.params === 'object' ? data.params : undefined,
      clarification: data.clarification,
      response: data.response,
    };
  } catch {
    return { type: 'general_chat', confidence: 0 };
  }
}

function validateIntentType(type: unknown): IntentType {
  const validTypes: IntentType[] = [
    'create_task',
    'start_stage',
    'complete_stage',
    'advance_stage',
    'jump_stage',
    'search_knowledge',
    'ask_question',
    'general_chat',
  ];
  return validTypes.includes(type as IntentType) ? (type as IntentType) : 'general_chat';
}

function postProcessIntent(
  intent: UserIntent,
  context: ParseContext
): UserIntent {
  // Parse failure fallback: confidence 0 with no fields means LLM response was invalid
  if (
    intent.type === 'general_chat' &&
    intent.confidence === 0 &&
    !intent.clarification &&
    !intent.response
  ) {
    return {
      type: 'general_chat',
      confidence: 0,
      response: '抱歉，解析请求时出了点问题，请再试一次。',
    };
  }

  // If confidence is low, convert to ask_question
  if (intent.confidence < CLARIFICATION_THRESHOLD) {
    return {
      type: 'ask_question',
      confidence: intent.confidence,
      clarification: intent.clarification || '能否再说具体一些？',
    };
  }

  // If stage-related intent but no active task, ask for task creation
  if (
    !context.currentTask &&
    (intent.type === 'start_stage' ||
      intent.type === 'complete_stage' ||
      intent.type === 'advance_stage' ||
      intent.type === 'jump_stage')
  ) {
    return {
      type: 'ask_question',
      confidence: 0.5,
      clarification: '没有活跃的任务，请先创建任务或选择一个已有任务。',
    };
  }

  return intent;
}
