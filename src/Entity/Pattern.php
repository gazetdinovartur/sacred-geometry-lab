<?php

declare(strict_types=1);

namespace App\Entity;

use App\Repository\PatternRepository;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: PatternRepository::class)]
#[ORM\Table(name: 'patterns')]
class Pattern
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\ManyToOne(inversedBy: 'patterns')]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private User $user;

    #[ORM\Column(length: 16)]
    private string $mode = 'live';

    #[ORM\Column(length: 24)]
    private string $geometryStyle = 'classic';

    /** @var array<string, mixed> */
    #[ORM\Column(type: Types::JSON)]
    private array $geometryParams = [];

    /** @var list<array<string, mixed>> */
    #[ORM\Column(type: Types::JSON)]
    private array $featureTimeline = [];

    #[ORM\Column(type: Types::TEXT)]
    private string $svg = '';

    #[ORM\Column(length: 64, nullable: true)]
    private ?string $voiceProfileHash = null;

    #[ORM\Column(length: 120, nullable: true)]
    private ?string $title = null;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    public function __construct()
    {
        $this->createdAt = new \DateTimeImmutable();
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getUser(): User
    {
        return $this->user;
    }

    public function setUser(User $user): self
    {
        $this->user = $user;

        return $this;
    }

    public function getMode(): string
    {
        return $this->mode;
    }

    public function setMode(string $mode): self
    {
        $this->mode = $mode;

        return $this;
    }

    public function getGeometryStyle(): string
    {
        return $this->geometryStyle;
    }

    public function setGeometryStyle(string $geometryStyle): self
    {
        $this->geometryStyle = $geometryStyle;

        return $this;
    }

    /** @return array<string, mixed> */
    public function getGeometryParams(): array
    {
        return $this->geometryParams;
    }

    /** @param array<string, mixed> $geometryParams */
    public function setGeometryParams(array $geometryParams): self
    {
        $this->geometryParams = $geometryParams;

        return $this;
    }

    /** @return list<array<string, mixed>> */
    public function getFeatureTimeline(): array
    {
        return $this->featureTimeline;
    }

    /** @param list<array<string, mixed>> $featureTimeline */
    public function setFeatureTimeline(array $featureTimeline): self
    {
        $this->featureTimeline = $featureTimeline;

        return $this;
    }

    public function getSvg(): string
    {
        return $this->svg;
    }

    public function setSvg(string $svg): self
    {
        $this->svg = $svg;

        return $this;
    }

    public function getVoiceProfileHash(): ?string
    {
        return $this->voiceProfileHash;
    }

    public function setVoiceProfileHash(?string $voiceProfileHash): self
    {
        $this->voiceProfileHash = $voiceProfileHash;

        return $this;
    }

    public function getTitle(): ?string
    {
        return $this->title;
    }

    public function setTitle(?string $title): self
    {
        $this->title = $title;

        return $this;
    }

    public function getCreatedAt(): \DateTimeImmutable
    {
        return $this->createdAt;
    }
}
