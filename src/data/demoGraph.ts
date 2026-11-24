import type { DemoKnowledgeGraph } from "../types";

export const demoGraph: DemoKnowledgeGraph = {
  course: "面向对象程序设计",
  subtitle: "C++ / MFC · 期末复习",
  language: "C++",
  framework: "MFC",
  model: "DeepSeek V4",
  sourceCount: 5,
  summary:
    "以类与对象、图形绘制、消息响应和组件绑定四条主线组织复习。先掌握对象生命周期和 MFC 数据交换，再进入绘图资源管理与消息处理。",
  branches: [
    { id: "class", title: "类与对象", color: "#137769" },
    { id: "graphics", title: "图形绘制", color: "#c56a2d" },
    { id: "messages", title: "消息与组件", color: "#315d84" },
  ],
  nodes: [
    {
      id: "constructor",
      title: "构造函数与析构函数",
      summary:
        "构造函数无返回值并在创建对象时执行一次，负责初始化；析构函数负责释放对象占用的资源。",
      type: "概念",
      importance: "core",
      evidence: [
        { source: "面向对象概念考点", page: 1 },
        { source: "面向对象概念考点", page: 3 },
      ],
      branch: "class",
      reviewHint: "常以填空题和代码阅读题出现，重点区分初始化与资源释放。",
    },
    {
      id: "access",
      title: "访问控制与继承",
      summary:
        "private、protected、public 控制成员的可见性；派生类可访问基类的 public 与 protected 成员。",
      type: "概念",
      importance: "core",
      evidence: [{ source: "面向对象概念考点", page: 5 }],
      branch: "class",
      reviewHint: "结合对象布局与继承关系判断成员能否被访问。",
    },
    {
      id: "naming",
      title: "类命名与文件组织",
      summary:
        "MFC 风格通常使用 C 前缀命名类，例如 CArrow，并配套 CArrow.h、CArrow.cpp、构造函数和析构函数。",
      type: "概念",
      importance: "important",
      evidence: [{ source: "面向对象概念考点", page: 3 }],
      branch: "class",
      reviewHint: "注意 C 前缀、头文件和源文件命名的对应关系。",
    },
    {
      id: "cdc",
      title: "CDC 与 GDI 绘图对象",
      summary:
        "CDC 提供绘图画布，CPen 和 CBrush 分别描述画笔与画刷；RGB 宏用于构造颜色。",
      type: "代码",
      importance: "core",
      evidence: [
        { source: "图形处理编程考点", page: 1 },
        { source: "图形处理编程考点", page: 2 },
      ],
      branch: "graphics",
      reviewHint: "先记对象创建顺序，再看如何选入设备上下文。",
    },
    {
      id: "resource",
      title: "绘图资源生命周期",
      summary:
        "自定义绘图对象需要创建、选入、使用、恢复旧对象并删除。遗漏恢复和删除可能造成资源泄漏。",
      type: "方法",
      importance: "core",
      evidence: [{ source: "图形处理编程考点", page: 2 }],
      branch: "graphics",
      reviewHint: "适合出顺序题，务必按完整生命周期记忆。",
    },
    {
      id: "redraw",
      title: "Invalidate 与 UpdateWindow",
      summary:
        "Invalidate 标记客户区需要重绘，UpdateWindow 使重绘立即发生；二者配合才能及时显示新图形。",
      type: "方法",
      importance: "important",
      evidence: [{ source: "图形处理编程考点", page: 2 }],
      branch: "graphics",
      reviewHint: "比较两个函数的触发时机，是常见的概念辨析点。",
    },
    {
      id: "bitmap",
      title: "位图显示与双缓冲",
      summary:
        "通过 CImage、CBitmap 和兼容 DC 完成位图加载与显示；双缓冲可减少重绘闪烁。",
      type: "代码",
      importance: "normal",
      evidence: [{ source: "图形处理编程考点", page: 5 }],
      branch: "graphics",
      reviewHint: "复习 StretchBlt 参数和兼容 DC 的作用。",
    },
    {
      id: "update-data",
      title: "UpdateData 数据交换",
      summary:
        "UpdateData(true) 把控件数据写入成员变量，UpdateData(false) 把成员变量显示到控件。",
      type: "代码",
      importance: "core",
      evidence: [{ source: "面向对象概念考点", page: 1 }],
      branch: "messages",
      reviewHint: "先判断数据方向，再分析按钮点击和定时器代码。",
    },
    {
      id: "messages",
      title: "鼠标与定时器消息",
      summary:
        "鼠标移动、按下、抬起分别对应 WM_MOUSEMOVE、WM_LBUTTONDOWN、WM_LBUTTONUP；定时器消息为 WM_TIMER。",
      type: "概念",
      importance: "important",
      evidence: [{ source: "消息响应知识考点", page: 1 }],
      branch: "messages",
      reviewHint: "记住消息名称、处理函数和参数的对应关系。",
    },
    {
      id: "ddx",
      title: "DDX 组件变量绑定",
      summary:
        "通过类向导、DDX_Control 或 DDX_Text 将控件与成员变量关联，再由 UpdateData 完成同步。",
      type: "方法",
      importance: "important",
      evidence: [
        { source: "组件使用考点", page: 3 },
        { source: "组件使用考点", page: 4 },
      ],
      branch: "messages",
      reviewHint: "把 DDX 绑定和 UpdateData 放在一条流程里理解。",
    },
  ],
  warnings: [
    "画笔和画刷使用后必须恢复旧对象并删除，避免资源泄漏。",
    "Invalidate 与 UpdateWindow 需要配合，否则新图形可能不能立即显示。",
  ],
};
