import { CopyOutlined, DeleteOutlined, HeartOutlined, KeyOutlined, PlusOutlined, SafetyCertificateOutlined, WarningOutlined } from "@ant-design/icons";
import { Alert, Badge, Button, Card, Col, Form, Image, Input, InputNumber, Modal, Popconfirm, Row, Space, Table, Tag, Tooltip, Typography, message } from "antd";
import { useCallback, useEffect, useState } from "react";

import { PageHeader } from "../../components/layout/app-shell";
import * as api from "../../lib/api";
import type { ApiKeyInfo, CreateApiKeyResponse } from "../../types";

const { Paragraph, Text, Title } = Typography;

function ApiKeyManager() {
  const [keys, setKeys] = useState<ApiKeyInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<CreateApiKeyResponse | null>(null);
  const [form] = Form.useForm();

  const loadKeys = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.fetchApiKeys();
      setKeys(res.items);
    } catch {
      message.error("加载 API Key 列表失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadKeys(); }, [loadKeys]);

  const handleCreate = async (values: { name: string; expires_in_days?: number }) => {
    setCreating(true);
    try {
      const res = await api.createApiKey({
        name: values.name,
        expires_in_days: values.expires_in_days || null,
      });
      setNewKey(res);
      setCreateOpen(false);
      form.resetFields();
      void loadKeys();
    } catch {
      message.error("创建失败");
    } finally {
      setCreating(false);
    }
  };

  const handleToggle = async (record: ApiKeyInfo) => {
    try {
      if (record.is_active) {
        await api.deactivateApiKey(record.id);
      } else {
        await api.activateApiKey(record.id);
      }
      void loadKeys();
    } catch {
      message.error("操作失败");
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.deleteApiKey(id);
      message.success("已删除");
      void loadKeys();
    } catch {
      message.error("删除失败");
    }
  };

  const columns = [
    {
      title: "名称",
      dataIndex: "name",
      key: "name",
      width: 160,
    },
    {
      title: "Key 前缀",
      dataIndex: "key_prefix",
      key: "key_prefix",
      width: 140,
      render: (v: string) => <Text code>{v}...</Text>,
    },
    {
      title: "状态",
      dataIndex: "is_active",
      key: "is_active",
      width: 80,
      render: (active: boolean) => active ? <Badge status="success" text="启用" /> : <Badge status="default" text="禁用" />,
    },
    {
      title: "过期时间",
      dataIndex: "expires_at",
      key: "expires_at",
      width: 170,
      render: (v: string | null) => v ? new Date(v).toLocaleString("zh-CN") : <Text type="secondary">永不过期</Text>,
    },
    {
      title: "最后使用",
      dataIndex: "last_used_at",
      key: "last_used_at",
      width: 170,
      render: (v: string | null) => v ? new Date(v).toLocaleString("zh-CN") : <Text type="secondary">未使用</Text>,
    },
    {
      title: "创建时间",
      dataIndex: "created_at",
      key: "created_at",
      width: 170,
      render: (v: string) => new Date(v).toLocaleString("zh-CN"),
    },
    {
      title: "操作",
      key: "action",
      width: 140,
      render: (_: unknown, record: ApiKeyInfo) => (
        <Space size="small">
          <Tooltip title={record.is_active ? "禁用" : "启用"}>
            <Button size="small" type="link" onClick={() => void handleToggle(record)}>
              {record.is_active ? "禁用" : "启用"}
            </Button>
          </Tooltip>
          <Popconfirm title="确定删除？删除后不可恢复" onConfirm={() => void handleDelete(record.id)}>
            <Button size="small" type="link" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Card
        title={<span><KeyOutlined style={{ marginRight: 8 }} />API Key 管理</span>}
        extra={<Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>创建 Key</Button>}
      >
        <Paragraph type="secondary" style={{ marginBottom: 16 }}>
          API Key 可用于通过 <Text code>X-API-Key</Text> 请求头进行无状态认证，适用于脚本和第三方集成。
        </Paragraph>
        <Table
          dataSource={keys}
          columns={columns}
          rowKey="id"
          loading={loading}
          size="small"
          pagination={false}
          scroll={{ x: 900 }}
        />
      </Card>

      <Modal
        title="创建 API Key"
        open={createOpen}
        onCancel={() => { setCreateOpen(false); form.resetFields(); }}
        onOk={() => form.submit()}
        confirmLoading={creating}
        okText="创建"
      >
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item name="name" label="名称" rules={[{ required: true, message: "请输入名称" }]}>
            <Input placeholder="例如: CI/CD Pipeline" maxLength={128} />
          </Form.Item>
          <Form.Item name="expires_in_days" label="有效天数（留空则永不过期）">
            <InputNumber min={1} max={365} placeholder="30" style={{ width: "100%" }} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="API Key 创建成功"
        open={!!newKey}
        onCancel={() => setNewKey(null)}
        footer={<Button type="primary" onClick={() => setNewKey(null)}>知道了</Button>}
      >
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message="请立即复制保存此 Key，关闭后将无法再次查看完整内容"
        />
        {newKey && (
          <div>
            <Text strong>名称：</Text> {newKey.name}
            <div style={{ marginTop: 12 }}>
              <Text strong>Key：</Text>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                <Input.TextArea value={newKey.key} readOnly autoSize={{ minRows: 2 }} style={{ fontFamily: "monospace", fontSize: 12 }} />
                <Tooltip title="复制">
                  <Button
                    icon={<CopyOutlined />}
                    onClick={() => {
                      void navigator.clipboard.writeText(newKey.key);
                      message.success("已复制到剪贴板");
                    }}
                  />
                </Tooltip>
              </div>
            </div>
            {newKey.expires_at && (
              <div style={{ marginTop: 8 }}>
                <Text strong>过期时间：</Text> {new Date(newKey.expires_at).toLocaleString("zh-CN")}
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}

export function SettingsPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Workspace"
        title="设置"
        description="用户空间、安全、文件存储和系统参数会集中在这里。"
      />

      <Row gutter={[16, 16]}>
        <Col xs={24}>
          <ApiKeyManager />
        </Col>

        <Col xs={24} lg={12}>
          <Card
            title={<span><SafetyCertificateOutlined style={{ marginRight: 8 }} />安全边界</span>}
          >
            <Paragraph>
              所有资源将通过平台用户和平台账号双重归属校验。Cookie 与模型 Key 由后端统一加密存储。
            </Paragraph>
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card
            title={<span><WarningOutlined style={{ marginRight: 8, color: "#faad14" }} />项目声明</span>}
          >
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 12 }}
              message="Spider_XHS 为开源学习项目，仅供技术研究和个人学习使用"
            />
            <Paragraph>
              <ul style={{ paddingLeft: 20, margin: 0 }}>
                <li><Text strong>禁止任何形式的商业化使用</Text>，包括但不限于出售、转卖、收费服务</li>
                <li><Text strong>禁止用于任何违法违规活动</Text>，包括但不限于数据贩卖、恶意爬取、侵犯隐私</li>
                <li>使用者需自行承担因使用本项目产生的一切法律责任</li>
                <li>请遵守小红书平台的用户协议和相关法律法规</li>
              </ul>
            </Paragraph>
          </Card>
        </Col>

        <Col xs={24}>
          <Card
            title={<span><HeartOutlined style={{ marginRight: 8, color: "#ff4d4f" }} />为爱发电</span>}
          >
            <Paragraph>
              本项目完全开源免费，如果对你有帮助，欢迎请作者喝杯咖啡 :)
            </Paragraph>
            <Row gutter={24} justify="center">
              <Col>
                <div style={{ textAlign: "center" }}>
                  <Image
                    src={`${import.meta.env.BASE_URL}api/files/media/wx_pay.png`}
                    width={200}
                    fallback="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iIzFmMWYxZiIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjOGM4YzhjIiBmb250LXNpemU9IjE0Ij7lvq7kv6HmlK/ku5g8L3RleHQ+PC9zdmc+"
                  />
                  <Text type="secondary" style={{ display: "block", marginTop: 8 }}>微信支付</Text>
                </div>
              </Col>
              <Col>
                <div style={{ textAlign: "center" }}>
                  <Image
                    src={`${import.meta.env.BASE_URL}api/files/media/zfb_pay.jpg`}
                    width={200}
                    fallback="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iIzFmMWYxZiIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjOGM4YzhjIiBmb250LXNpemU9IjE0Ij7mlK/ku5jlrp3mlK/ku5g8L3RleHQ+PC9zdmc+"
                  />
                  <Text type="secondary" style={{ display: "block", marginTop: 8 }}>支付宝</Text>
                </div>
              </Col>
            </Row>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
