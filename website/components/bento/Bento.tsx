import { copy } from "@/lib/copy";
import { Container } from "@/components/ui/Container";
import { PipelineTile } from "./tiles/PipelineTile";
import { ScanTile } from "./tiles/ScanTile";
import { ProofTile } from "./tiles/ProofTile";
import { AgentsTile } from "./tiles/AgentsTile";
import { DiffTile } from "./tiles/DiffTile";
import { CompatTile } from "./tiles/CompatTile";
import styles from "./bento.module.css";

/**
 * Bento grid — "How it works" section.
 * 6-column responsive grid with 6 tiles.
 * Server component. Each tile is self-contained.
 */
export function Bento() {
  return (
    <section
      id="pipeline"
      data-component="bento"
      className={styles.section}
    >
      <Container>
        <header className={styles.heading}>
          <div>
            <div className={styles.eyebrow}>
              <span className={styles.brandDot} />
              {copy.bento.heading.eyebrow}
            </div>
            <h2>{copy.bento.heading.title}</h2>
          </div>
        </header>

        <div className={styles.grid}>
          <PipelineTile />
          <ScanTile />
          <ProofTile />
          <AgentsTile />
          <DiffTile />
          <CompatTile />
        </div>
      </Container>
    </section>
  );
}
