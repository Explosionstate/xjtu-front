import sys
from PyQt6.QtWidgets import (QApplication, QMainWindow, QWidget, QHBoxLayout,
                             QVBoxLayout, QPushButton, QLabel, QLineEdit,
                             QScrollArea, QGridLayout, QFrame, QSizePolicy)
from PyQt6.QtCore import Qt, QSize
from PyQt6.QtGui import QFont, QColor
from PyQt6.QtWidgets import QGraphicsDropShadowEffect


class NeonButton(QPushButton):
    """自定义带霓虹发光效果的按钮"""

    def __init__(self, text, is_primary=False):
        super().__init__(text)
        self.setCursor(Qt.CursorShape.PointingHandCursor)
        if is_primary:
            self.setObjectName("PrimaryButton")
            # 添加发光阴影效果
            shadow = QGraphicsDropShadowEffect()
            shadow.setBlurRadius(20)
            shadow.setColor(QColor("#00E5FF"))
            shadow.setOffset(0, 0)
            self.setGraphicsEffect(shadow)
        else:
            self.setObjectName("SecondaryButton")


class AINexusApp(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("ai助手")
        self.resize(1200, 800)
        self.init_ui()
        self.apply_styles()

    def init_ui(self):
        # 主控窗口部件
        central_widget = QWidget()
        self.setCentralWidget(central_widget)

        # 主水平布局：侧边栏 + 聊天区 + 右侧卡片区
        main_layout = QHBoxLayout(central_widget)
        main_layout.setContentsMargins(0, 0, 0, 0)
        main_layout.setSpacing(0)

        # 1. 构建左侧边栏 (Sidebar)
        sidebar = QFrame()
        sidebar.setObjectName("Sidebar")
        sidebar.setFixedWidth(260)
        sidebar_layout = QVBoxLayout(sidebar)
        sidebar_layout.setContentsMargins(20, 30, 20, 30)
        sidebar_layout.setSpacing(20)

        # Logo 区
        logo_label = QLabel("🌌 Nexus AIPrime")
        logo_label.setObjectName("LogoText")

        # 新建聊天按钮
        new_chat_btn = NeonButton("+  New Chat", is_primary=True)
        new_chat_btn.setFixedHeight(45)

        # 历史记录列表
        history_label = QLabel("Recent Chats")
        history_label.setObjectName("SectionTitle")

        history_items = ["Quantum Computing...", "Market Analysis Q3", "Design Sprint Draft"]
        history_layout = QVBoxLayout()
        history_layout.setSpacing(10)
        for item in history_items:
            btn = QPushButton(item)
            btn.setObjectName("HistoryItem")
            btn.setCursor(Qt.CursorShape.PointingHandCursor)
            history_layout.addWidget(btn)

        sidebar_layout.addWidget(logo_label)
        sidebar_layout.addWidget(new_chat_btn)
        sidebar_layout.addWidget(history_label)
        sidebar_layout.addLayout(history_layout)
        sidebar_layout.addStretch()

        # 2. 构建中间聊天区 (Chat Area)
        chat_area = QFrame()
        chat_area.setObjectName("ChatArea")
        chat_layout = QVBoxLayout(chat_area)
        chat_layout.setContentsMargins(30, 30, 30, 30)

        chat_header = QLabel("Chat Stream")
        chat_header.setObjectName("ChatHeader")

        # 聊天滚动区
        scroll_area = QScrollArea()
        scroll_area.setWidgetResizable(True)
        scroll_area.setObjectName("ScrollArea")

        scroll_content = QWidget()
        scroll_content.setObjectName("ScrollContent")
        scroll_layout = QVBoxLayout(scroll_content)
        scroll_layout.setAlignment(Qt.AlignmentFlag.AlignTop)

        # 模拟几条消息
        scroll_layout.addWidget(
            self.create_message_bubble("Summarize the key findings of the attached paper on quantum machine learning.",
                                       is_user=True))
        scroll_layout.addWidget(self.create_message_bubble(
            "Absolutely. Analyzing the impact of QML, we see significant generative concepts and ultimate growth in pattern recognition...",
            is_user=False))

        scroll_area.setWidget(scroll_content)

        # 底部输入框
        input_container = QFrame()
        input_container.setObjectName("InputContainer")
        input_layout = QHBoxLayout(input_container)
        input_layout.setContentsMargins(15, 10, 15, 10)

        input_box = QLineEdit()
        input_box.setPlaceholderText("Message Nexus AI...")
        input_box.setObjectName("InputBox")

        send_btn = NeonButton("Send 🚀", is_primary=True)
        send_btn.setFixedSize(100, 40)

        input_layout.addWidget(input_box)
        input_layout.addWidget(send_btn)

        chat_layout.addWidget(chat_header)
        chat_layout.addWidget(scroll_area)
        chat_layout.addWidget(input_container)

        # 3. 构建右侧功能区 (Right Panel)
        right_panel = QFrame()
        right_panel.setObjectName("RightPanel")
        right_panel.setFixedWidth(320)
        right_layout = QVBoxLayout(right_panel)
        right_layout.setContentsMargins(20, 30, 20, 30)

        welcome_label = QLabel("Welcome to AI")
        welcome_label.setObjectName("SectionTitle")

        # 右侧快捷卡片网格
        grid_layout = QGridLayout()
        grid_layout.setSpacing(15)

        cards = [
            ("📝", "Draft Blog Post"),
            ("🐍", "Write Python Code"),
            ("📈", "Analyze Trends"),
            ("🎨", "Image Prompt")
        ]

        for i, (icon, text) in enumerate(cards):
            card = QFrame()
            card.setObjectName("ActionCard")
            card.setCursor(Qt.CursorShape.PointingHandCursor)
            card_layout = QVBoxLayout(card)
            card_layout.addWidget(QLabel(icon))
            card_text = QLabel(text)
            card_text.setWordWrap(True)
            card_layout.addWidget(card_text)
            grid_layout.addWidget(card, i // 2, i % 2)

        right_layout.addWidget(welcome_label)
        right_layout.addSpacing(30)
        right_layout.addLayout(grid_layout)
        right_layout.addStretch()

        # 将三部分组装到主布局
        main_layout.addWidget(sidebar)
        main_layout.addWidget(chat_area)
        main_layout.addWidget(right_panel)

    def create_message_bubble(self, text, is_user=False):
        """创建聊天气泡"""
        container = QFrame()
        layout = QHBoxLayout(container)
        layout.setContentsMargins(0, 10, 0, 10)

        bubble = QLabel(text)
        bubble.setWordWrap(True)
        bubble.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Minimum)

        if is_user:
            bubble.setObjectName("UserBubble")
            layout.addStretch()
            layout.addWidget(bubble)
        else:
            bubble.setObjectName("AIBubble")

            # 添加发光阴影给 AI 的消息框
            shadow = QGraphicsDropShadowEffect()
            shadow.setBlurRadius(15)
            shadow.setColor(QColor(0, 229, 255, 60))  # 半透明青色发光
            shadow.setOffset(0, 0)
            bubble.setGraphicsEffect(shadow)

            layout.addWidget(bubble)
            layout.addStretch()

        return container

    def apply_styles(self):
        """核心全局样式表 QSS (类似于网页的 CSS)"""
        qss = """
        /* 全局深色背景设定 */
        QWidget {
            background-color: #0A0F1C;
            color: #E0E7FF;
            font-family: "Segoe UI", "Microsoft YaHei", sans-serif;
            font-size: 14px;
        }

        /* 侧边栏和右侧面板 */
        #Sidebar, #RightPanel {
            background-color: rgba(16, 24, 39, 0.8);
            border-right: 1px solid rgba(0, 229, 255, 0.1);
            border-left: 1px solid rgba(0, 229, 255, 0.1);
        }

        /* 聊天主区域 */
        #ChatArea {
            background-color: #050810;
        }

        #LogoText {
            font-size: 20px;
            font-weight: bold;
            color: #00E5FF;
            padding-bottom: 20px;
        }

        #SectionTitle {
            font-size: 16px;
            font-weight: bold;
            color: #9CA3AF;
        }

        #ChatHeader {
            font-size: 18px;
            font-weight: bold;
            padding-bottom: 15px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        /* 主按钮（霓虹蓝） */
        #PrimaryButton {
            background: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 #0072FF, stop:1 #00E5FF);
            color: white;
            border-radius: 8px;
            font-weight: bold;
            font-size: 15px;
            border: none;
        }
        #PrimaryButton:hover {
            background: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 #005BCC, stop:1 #00B8CC);
        }

        /* 历史记录按钮 */
        #HistoryItem {
            background-color: transparent;
            color: #9CA3AF;
            text-align: left;
            padding: 10px;
            border-radius: 6px;
            border: 1px solid transparent;
        }
        #HistoryItem:hover {
            background-color: rgba(255, 255, 255, 0.05);
            color: #00E5FF;
            border: 1px solid rgba(0, 229, 255, 0.3);
        }

        /* 聊天气泡样式 */
        #UserBubble {
            background-color: rgba(255, 255, 255, 0.1);
            color: #FFFFFF;
            padding: 15px 20px;
            border-radius: 12px;
            border-top-right-radius: 2px;
            max-width: 600px;
        }

        #AIBubble {
            background-color: rgba(0, 229, 255, 0.05);
            color: #E0E7FF;
            padding: 15px 20px;
            border-radius: 12px;
            border-top-left-radius: 2px;
            border: 1px solid rgba(0, 229, 255, 0.4);
            max-width: 600px;
        }

        /* 滚动条隐藏化处理，使其更高级 */
        QScrollArea {
            border: none;
            background-color: transparent;
        }
        #ScrollContent {
            background-color: transparent;
        }
        QScrollBar:vertical {
            border: none;
            background: rgba(255, 255, 255, 0.05);
            width: 8px;
            border-radius: 4px;
        }
        QScrollBar::handle:vertical {
            background: rgba(255, 255, 255, 0.2);
            border-radius: 4px;
        }

        /* 底部输入框 */
        #InputContainer {
            background-color: rgba(16, 24, 39, 0.9);
            border-radius: 12px;
            border: 1px solid rgba(0, 229, 255, 0.3);
        }
        #InputBox {
            background-color: transparent;
            border: none;
            color: white;
            font-size: 15px;
        }

        /* 右侧操作卡片 */
        #ActionCard {
            background-color: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(0, 229, 255, 0.1);
            border-radius: 12px;
            padding: 15px;
        }
        #ActionCard:hover {
            background-color: rgba(0, 229, 255, 0.08);
            border: 1px solid rgba(0, 229, 255, 0.6);
        }
        """
        self.setStyleSheet(qss)


if __name__ == "__main__":
    app = QApplication(sys.argv)
    window = AINexusApp()
    window.show()
    sys.exit(app.exec())