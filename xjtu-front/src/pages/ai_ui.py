import sys
import uuid
from PyQt6.QtWidgets import (QApplication, QMainWindow, QWidget, QHBoxLayout,
                             QVBoxLayout, QPushButton, QLabel, QLineEdit,
                             QScrollArea, QGridLayout, QFrame, QSizePolicy,
                             QListWidget, QListWidgetItem, QCheckBox)
from PyQt6.QtCore import Qt, QTimer
from PyQt6.QtGui import QFont, QColor
from PyQt6.QtWidgets import QGraphicsDropShadowEffect
from PyQt6.QtWidgets import QScrollArea


class NeonButton(QPushButton):

    def __init__(self, text, is_primary=False):
        super().__init__(text)
        self.setCursor(Qt.CursorShape.PointingHandCursor)
        if is_primary:
            self.setObjectName("PrimaryButton")
            # 添加发光阴影效果 (保留原版)
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

        # 1. 保留并结构化原有的历史记录数据
        self.current_session_id = None
        self.chat_history_data = {
            "session_1": {
                "title": "Quantum Computing...",
                "messages": [
                    ("user", "Summarize the key findings of the attached paper on quantum machine learning."),
                    ("ai",
                     "Absolutely. Analyzing the impact of QML, we see significant generative concepts and ultimate growth in pattern recognition...")
                ]
            },
            "session_2": {
                "title": "Market Analysis Q3",
                "messages": [("ai", "Here is the preliminary Market Analysis for Q3. How would you like to dive in?")]
            },
            "session_3": {
                "title": "Design Sprint Draft",
                "messages": [("user", "Help me draft a design sprint."),
                             ("ai", "Sure, let's start with defining our primary goal for the sprint.")]
            }
        }

        self.init_ui()
        self.apply_styles()
        first_item = self.history_list.item(0)
        if first_item:
            self.history_list.setCurrentItem(first_item)
            self.switch_chat_session(first_item)

    def init_ui(self):
        central_widget = QWidget()
        self.setCentralWidget(central_widget)

        main_layout = QHBoxLayout(central_widget)
        main_layout.setContentsMargins(0, 0, 0, 0)
        main_layout.setSpacing(0)

        sidebar = QFrame()
        sidebar.setObjectName("Sidebar")
        sidebar.setFixedWidth(260)
        sidebar_layout = QVBoxLayout(sidebar)
        sidebar_layout.setContentsMargins(20, 30, 20, 30)
        sidebar_layout.setSpacing(20)

        logo_label = QLabel("🌌 Nexus AIPrime")
        logo_label.setObjectName("LogoText")

        new_chat_btn = NeonButton("+  New Chat", is_primary=True)
        new_chat_btn.setFixedHeight(45)
        new_chat_btn.clicked.connect(self.start_new_chat)

        history_label = QLabel("Recent Chats")
        history_label.setObjectName("SectionTitle")

        self.history_list = QListWidget()
        self.history_list.setObjectName("HistoryList")
        self.history_list.itemClicked.connect(self.switch_chat_session)

        for session_id, data in self.chat_history_data.items():
            item = QListWidgetItem(data["title"])
            item.setData(Qt.ItemDataRole.UserRole, session_id)
            self.history_list.addItem(item)

        sidebar_layout.addWidget(logo_label)
        sidebar_layout.addWidget(new_chat_btn)
        sidebar_layout.addWidget(history_label)
        sidebar_layout.addWidget(self.history_list)

        chat_area = QFrame()
        chat_area.setObjectName("ChatArea")
        chat_layout = QVBoxLayout(chat_area)
        chat_layout.setContentsMargins(30, 30, 30, 30)

        self.chat_header = QLabel("Chat Stream")
        self.chat_header.setObjectName("ChatHeader")

        self.scroll_area = QScrollArea()
        self.scroll_area.setWidgetResizable(True)
        self.scroll_area.setObjectName("ScrollArea")

        self.scroll_content = QWidget()
        self.scroll_content.setObjectName("ScrollContent")
        self.scroll_layout = QVBoxLayout(self.scroll_content)
        self.scroll_layout.setAlignment(Qt.AlignmentFlag.AlignTop)
        self.scroll_layout.setSpacing(15)  # 调整气泡间距
        self.scroll_area.setWidget(self.scroll_content)

        options_layout = QHBoxLayout()
        options_layout.setAlignment(Qt.AlignmentFlag.AlignLeft)

        self.search_toggle = QCheckBox("🌐 Web Search")
        self.search_toggle.setObjectName("CustomToggle")
        self.search_toggle.setCursor(Qt.CursorShape.PointingHandCursor)

        self.think_toggle = QCheckBox("🧠 Deep Think")
        self.think_toggle.setObjectName("CustomToggle")
        self.think_toggle.setCursor(Qt.CursorShape.PointingHandCursor)

        options_layout.addWidget(self.search_toggle)
        options_layout.addWidget(self.think_toggle)
        input_container = QFrame()
        input_container.setObjectName("InputContainer")
        input_layout = QHBoxLayout(input_container)
        input_layout.setContentsMargins(15, 10, 15, 10)

        self.input_box = QLineEdit()
        self.input_box.setPlaceholderText("Message Nexus AI...")
        self.input_box.setObjectName("InputBox")
        self.input_box.returnPressed.connect(self.send_message)

        send_btn = NeonButton("Send 🚀", is_primary=True)
        send_btn.setFixedSize(100, 40)
        send_btn.clicked.connect(self.send_message)

        input_layout.addWidget(self.input_box)
        input_layout.addWidget(send_btn)

        chat_layout.addWidget(self.chat_header)
        chat_layout.addWidget(self.scroll_area)
        chat_layout.addLayout(options_layout)
        chat_layout.addWidget(input_container)
        right_panel = QFrame()
        right_panel.setObjectName("RightPanel")
        right_panel.setFixedWidth(320)
        right_layout = QVBoxLayout(right_panel)
        right_layout.setContentsMargins(0, 0, 0, 0)
        right_layout.setSpacing(0)

        right_header = QFrame()
        right_header.setObjectName("RightPanelHeader")
        right_header_layout = QVBoxLayout(right_header)
        right_header_layout.setContentsMargins(20, 30, 20, 20)

        grid_layout = QGridLayout()
        grid_layout.setSpacing(15)

        cards = [
            ("📝", "Draft Blog Post"),
            ("🐍", "Write Python Code"),
            ("📈", "Analyze Trends"),
            ("🎨", "Image Prompt")
        ]

        for i, (icon, text) in enumerate(cards):
            card = QPushButton()
            card.setObjectName("ActionCard")
            card.setCursor(Qt.CursorShape.PointingHandCursor)

            card_layout = QVBoxLayout(card)
            card_layout.addWidget(QLabel(icon))
            card_text = QLabel(text)
            card_text.setWordWrap(True)
            card_layout.addWidget(card_text)

            card.clicked.connect(lambda checked, t=text: self.input_box.setText(f"Help me {t.lower()}..."))
            grid_layout.addWidget(card, i // 2, i % 2)

        right_layout.addWidget(welcome_label)
        right_layout.addSpacing(30)
        right_layout.addLayout(grid_layout)
        right_layout.addStretch()

        main_layout.addWidget(sidebar)
        main_layout.addWidget(chat_area)
        main_layout.addWidget(right_panel)

    def start_new_chat(self):
        session_id = str(uuid.uuid4())
        title = "New Chat"
        self.chat_history_data[session_id] = {"title": title, "messages": []}

        item = QListWidgetItem(title)
        item.setData(Qt.ItemDataRole.UserRole, session_id)
        self.history_list.insertItem(0, item)
        self.history_list.setCurrentItem(item)
        self.switch_chat_session(item)

    def switch_chat_session(self, item):
        session_id = item.data(Qt.ItemDataRole.UserRole)
        self.current_session_id = session_id
        session_data = self.chat_history_data[session_id]

        self.chat_header.setText(session_data["title"])

        while self.scroll_layout.count():
            child = self.scroll_layout.takeAt(0)
            if child.widget():
                child.widget().deleteLater()

        for role, text in session_data["messages"]:
            self.scroll_layout.addWidget(self.create_message_bubble(text, role == "user"))

        QTimer.singleShot(50, self.scroll_to_bottom)

    def send_message(self):
        text = self.input_box.text().strip()
        if not text or not self.current_session_id:
            return

        is_search = self.search_toggle.isChecked()
        is_think = self.think_toggle.isChecked()

        self.input_box.clear()

        self.chat_history_data[self.current_session_id]["messages"].append(("user", text))
        self.scroll_layout.addWidget(self.create_message_bubble(text, is_user=True))
        self.scroll_to_bottom()
        if len(self.chat_history_data[self.current_session_id]["messages"]) == 1:
            title = text[:15] + "..." if len(text) > 15 else text
            self.chat_history_data[self.current_session_id]["title"] = title
            self.history_list.currentItem().setText(title)
            self.chat_header.setText(title)

        QTimer.singleShot(600, lambda: self.simulate_ai_response(text, is_search, is_think))

    def simulate_ai_response(self, text, is_search, is_think):
        reply_prefix = ""
        if is_think:
            reply_prefix += "[Deep Thinking Completed] \n"
        if is_search:
            reply_prefix += "[Web Search Results Included] \n"

        ai_reply = reply_prefix + f"I have received your query about: '{text}'. This is a simulated AI response."
        self.chat_history_data[self.current_session_id]["messages"].append(("ai", ai_reply))
        self.scroll_layout.addWidget(self.create_message_bubble(ai_reply, is_user=False))
        self.scroll_to_bottom()

    def create_message_bubble(self, text, is_user=False):
        container = QFrame()
        layout = QHBoxLayout(container)
        layout.setContentsMargins(0, 10, 0, 10)

        bubble = QLabel(text)
        bubble.setWordWrap(True)
        bubble.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
        bubble.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Minimum)
        bubble.setMaximumWidth(700)

        if is_user:
            bubble.setObjectName("UserBubble")
            layout.addStretch()
            layout.addWidget(bubble)

            avatar = QLabel("U")
            avatar.setObjectName("UserAvatar")
            layout.addWidget(avatar, alignment=Qt.AlignmentFlag.AlignTop)
        else:
            bubble.setObjectName("AIBubble")

            avatar = QLabel("AI")
            avatar.setObjectName("AIAvatar")
            layout.addWidget(avatar, alignment=Qt.AlignmentFlag.AlignTop)
            layout.addWidget(bubble)
            shadow = QGraphicsDropShadowEffect()
            shadow.setBlurRadius(15)
            shadow.setColor(QColor(0, 229, 255, 60))
            shadow.setOffset(0, 0)
            bubble.setGraphicsEffect(shadow)

            layout.addStretch()

        return container

    def scroll_to_bottom(self):
        scrollbar = self.scroll_area.verticalScrollBar()
        scrollbar.setValue(scrollbar.maximum())

    def apply_styles(self):
        qss = """
        /* 全局深色背景设定 (完全保留) */
        QWidget {
            background-color: #0A0F1C;
            color: #E0E7FF;
            font-family: "Segoe UI", "Microsoft YaHei", sans-serif;
            font-size: 14px;
        }

        #Sidebar, #RightPanel {
            background-color: rgba(16, 24, 39, 0.8);
            border-right: 1px solid rgba(0, 229, 255, 0.1);
            border-left: 1px solid rgba(0, 229, 255, 0.1);
        }

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

        /* ==== 按钮和交互反馈 (保留原有渐变色并增加按压反馈) ==== */
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
        #PrimaryButton:pressed {
            padding-top: 2px; /* 点击下陷反馈 */
            background: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 #0047A3, stop:1 #0093A3);
        }

        /* ==== 左侧历史记录 QListWidget 适配原版的 HistoryItem 样式 ==== */
        #HistoryList {
            background: transparent;
            border: none;
            outline: none;
        }
        #HistoryList::item {
            color: #9CA3AF;
            padding: 10px;
            border-radius: 6px;
            margin-bottom: 5px;
            border: 1px solid transparent;
        }
        #HistoryList::item:hover {
            background-color: rgba(255, 255, 255, 0.05);
            color: #00E5FF;
            border: 1px solid rgba(0, 229, 255, 0.3);
        }
        #HistoryList::item:selected {
            background-color: rgba(0, 229, 255, 0.15);
            color: #00E5FF;
            border: 1px solid #00E5FF;
            font-weight: bold;
        }

        /* ==== 通义千问风格的聊天气泡和头像 ==== */
        #UserBubble {
            background-color: rgba(0, 114, 255, 0.8); /* 用户的蓝色底 */
            color: #FFFFFF;
            padding: 15px 20px;
            border-radius: 12px;
            border-top-right-radius: 2px;
        }
        #AIBubble {
            background-color: rgba(0, 229, 255, 0.05); /* 您原版的底色 */
            color: #E0E7FF;
            padding: 15px 20px;
            border-radius: 12px;
            border-top-left-radius: 2px;
            border: 1px solid rgba(0, 229, 255, 0.4);
        }
        #UserAvatar {
            background-color: #0072FF;
            color: white;
            border-radius: 15px;
            min-width: 30px; max-width: 30px;
            min-height: 30px; max-height: 30px;
            qproperty-alignment: AlignCenter;
            margin-left: 10px;
        }
        #AIAvatar {
            background-color: #00E5FF;
            color: #0A0F1C;
            border-radius: 15px;
            font-weight: bold;
            min-width: 30px; max-width: 30px;
            min-height: 30px; max-height: 30px;
            qproperty-alignment: AlignCenter;
            margin-right: 10px;
        }

        /* 滚动条隐藏化处理 (保留原版) */
        QScrollArea { border: none; background-color: transparent; }
        #ScrollContent { background-color: transparent; }
        QScrollBar:vertical {
            border: none;
            background: rgba(255, 255, 255, 0.05);
            width: 8px; border-radius: 4px;
        }
        QScrollBar::handle:vertical {
            background: rgba(255, 255, 255, 0.2);
            border-radius: 4px;
        }

        /* ==== 底部输入框和新增的开关 ==== */
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

        #CustomToggle {
            color: #9CA3AF;
            font-weight: bold;
            padding: 5px 10px;
        }
        #CustomToggle:hover { color: #E0E7FF; }
        #CustomToggle:checked { color: #00E5FF; }
        #CustomToggle::indicator { width: 0px; } /* 隐藏原生勾选框 */

        /* ==== 右侧操作卡片 (原版布局，增加点击效果) ==== */
        #ActionCard {
            background-color: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(0, 229, 255, 0.1);
            border-radius: 12px;
            padding: 15px;
            text-align: left; /* 保留您原版左对齐的格式 */
        }
        #ActionCard:hover {
            background-color: rgba(0, 229, 255, 0.08);
            border: 1px solid rgba(0, 229, 255, 0.6);
        }
        #ActionCard:pressed {
            background-color: rgba(0, 229, 255, 0.15);
            padding-top: 17px; padding-bottom: 13px; /* 点击位移反馈 */
        }
        """
        self.setStyleSheet(qss)

if __name__ == "__main__":
    app = QApplication(sys.argv)
    window = AINexusApp()
    window.show()
    sys.exit(app.exec())